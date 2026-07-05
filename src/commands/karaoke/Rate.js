import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder } from 'discord.js';
import Command from "../../structures/Command.js";
import { KaraokeQueue, Rating } from "../../schemas/karaoke.js";
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const emoji = require("../../data/emoji.json");

export default class Rate extends Command {
    constructor(client) {
        super(client, {
            name: 'rate',
            description: {
                content: 'Rate a karaoke performance',
                usage: '<1-5> [comment]',
                examples: ['rate 5 Amazing voice!', 'rate 4', 'rate leaderboard'],
            },
            aliases: ['score', 'review'],
            category: 'karaoke',
            cooldown: 5,
            permissions: {
                dev: false,
                client: ['SendMessages', 'ViewChannel', 'EmbedLinks'],
                user: [],
            },
            slashCommand: true,
            options: [
                {
                    name: 'performance',
                    description: 'Rate the current or last performance',
                    type: 1,
                    options: [
                        {
                            name: 'score',
                            description: 'Rating from 1-5 stars',
                            type: 4,
                            required: true,
                            min_value: 1,
                            max_value: 5
                        },
                        {
                            name: 'comment',
                            description: 'Optional comment for the performer',
                            type: 3,
                            required: false
                        }
                    ]
                },
                {
                    name: 'leaderboard',
                    description: 'View top rated performers',
                    type: 1
                },
                {
                    name: 'history',
                    description: 'View your rating history or a user\'s ratings',
                    type: 1,
                    options: [
                        {
                            name: 'user',
                            description: 'User to view ratings for',
                            type: 6,
                            required: false
                        }
                    ]
                }
            ]
        });
    }

    async run(ctx, args) {
        // Rating system is disabled
        return ctx.sendMessage({
            content: `${emoji.status.error} The rating system is currently disabled.`,
            flags: 64
        });
    }

    async ratePerformance(ctx, args) {
        const session = await KaraokeQueue.findOne({ 
            guildId: ctx.guild.id, 
            isActive: true 
        }).catch(() => null);

        if (!session) {
            return ctx.sendMessage({ content: '❌ No active karaoke session.', flags: 64 });
        }

        if (!session.settings.allowRatings) {
            return ctx.sendMessage({ content: '❌ Ratings are disabled for this session.', flags: 64 });
        }

        const singer = session.currentSinger;
        if (!singer?.userId) {
            return ctx.sendMessage({ content: '❌ No one is currently singing. Wait for a performance to rate!', flags: 64 });
        }

        if (singer.userId === ctx.author.id) {
            return ctx.sendMessage({ content: '❌ You can\'t rate your own performance!', flags: 64 });
        }

        const score = ctx.isInteraction 
            ? ctx.interaction.options.getInteger('score') 
            : parseInt(args[0]);
        const comment = ctx.isInteraction 
            ? ctx.interaction.options.getString('comment') 
            : args.slice(1).join(' ');

        if (!score || score < 1 || score > 5) {
            return ctx.sendMessage({ content: '❌ Please provide a rating between 1-5!', flags: 64 });
        }

        let rating = await Rating.findOne({
            guildId: ctx.guild.id,
            singerId: singer.userId,
            songId: singer.songId,
            performedAt: { $gte: singer.startedAt }
        }).catch(() => null);

        if (!rating) {
            rating = await Rating.create({
                guildId: ctx.guild.id,
                singerId: singer.userId,
                singerUsername: singer.username,
                songId: singer.songId,
                songTitle: singer.songTitle,
                ratings: [],
                performedAt: singer.startedAt
            }).catch(() => null);
        }

        if (!rating) {
            return ctx.sendMessage({ content: '❌ Failed to save rating. Database may be unavailable.', flags: 64 });
        }

        const existingRating = rating.ratings.find(r => r.oderId === ctx.author.id);
        if (existingRating) {
            return ctx.sendMessage({ content: '❌ You already rated this performance!', flags: 64 });
        }

        rating.ratings.push({
            oderId: ctx.author.id,
            odername: ctx.author.username,
            score,
            comment: comment || null
        });

        const totalScore = rating.ratings.reduce((sum, r) => sum + r.score, 0);
        rating.averageRating = totalScore / rating.ratings.length;
        await rating.save().catch(() => {});

        const stars = '⭐'.repeat(score) + '☆'.repeat(5 - score);

        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('# ⭐ Rating Submitted!'))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `You rated **${singer.username}**'s performance!\n\n` +
                `🎵 **Song:** ${singer.songTitle}\n` +
                `${stars} **Your Rating:** ${score}/5\n` +
                `${comment ? `💬 **Comment:** ${comment}\n` : ''}` +
                `\n📊 **Current Average:** ${rating.averageRating.toFixed(1)}/5 (${rating.ratings.length} votes)`
            ));

        return ctx.sendMessage({ components: [container], flags: 32768 });
    }

    async showLeaderboard(ctx) {
        const topPerformers = await Rating.aggregate([
            { $match: { guildId: ctx.guild.id } },
            {
                $group: {
                    _id: '$singerId',
                    username: { $last: '$singerUsername' },
                    totalPerformances: { $sum: 1 },
                    avgRating: { $avg: '$averageRating' },
                    totalVotes: { $sum: { $size: '$ratings' } }
                }
            },
            { $match: { totalVotes: { $gte: 1 } } },
            { $sort: { avgRating: -1, totalVotes: -1 } },
            { $limit: 10 }
        ]).catch(() => []);

        if (topPerformers.length === 0) {
            const container = new ContainerBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent('# 🏆 Karaoke Leaderboard'))
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    'No ratings yet!\n\nStart singing and get rated to appear on the leaderboard!'
                ));

            return ctx.sendMessage({ components: [container], flags: 32768 });
        }

        const leaderboardList = topPerformers.map((p, i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
            const stars = '⭐'.repeat(Math.round(p.avgRating));
            return `${medal} **${p.username}**\n   ${stars} ${p.avgRating.toFixed(1)}/5 • ${p.totalPerformances} songs • ${p.totalVotes} votes`;
        }).join('\n\n');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('rate_history_self')
                .setLabel('My Ratings')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('📊'),
            new ButtonBuilder()
                .setCustomId('leaderboard_refresh')
                .setLabel('Refresh')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🔄')
        );

        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('# 🏆 Karaoke Leaderboard'))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Top Performers:**\n\n${leaderboardList}`))
            .addActionRowComponents(row);

        return ctx.sendMessage({ components: [container], flags: 32768 });
    }

    async showHistory(ctx, args) {
        const targetUser = ctx.isInteraction 
            ? ctx.interaction.options.getUser('user') || ctx.author
            : ctx.author;

        const ratings = await Rating.find({
            guildId: ctx.guild.id,
            singerId: targetUser.id
        }).sort({ performedAt: -1 }).limit(10).catch(() => []);

        if (ratings.length === 0) {
            const container = new ContainerBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent('# 📊 Rating History'))
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    targetUser.id === ctx.author.id
                        ? 'You haven\'t performed yet!\n\nJoin the queue with `/queue add` to start singing!'
                        : `**${targetUser.username}** hasn't performed yet.`
                ));

            return ctx.sendMessage({ components: [container], flags: 32768 });
        }

        const totalVotes = ratings.reduce((sum, r) => sum + r.ratings.length, 0);
        const overallAvg = ratings.reduce((sum, r) => sum + r.averageRating, 0) / ratings.length;

        const historyList = ratings.slice(0, 5).map(r => {
            const stars = '⭐'.repeat(Math.round(r.averageRating));
            return `🎵 **${r.songTitle}**\n   ${stars} ${r.averageRating.toFixed(1)}/5 (${r.ratings.length} votes)`;
        }).join('\n\n');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('rate_leaderboard')
                .setLabel('Leaderboard')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🏆')
        );

        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 📊 ${targetUser.username}'s Stats`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `**Overall:** ${'⭐'.repeat(Math.round(overallAvg))} ${overallAvg.toFixed(1)}/5\n` +
                `**Performances:** ${ratings.length} | **Total Votes:** ${totalVotes}\n\n` +
                `**Recent Performances:**\n\n${historyList}`
            ))
            .addActionRowComponents(row);

        return ctx.sendMessage({ components: [container], flags: 32768 });
    }
}
