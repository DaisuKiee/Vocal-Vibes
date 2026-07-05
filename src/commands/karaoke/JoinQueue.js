import Command from "../../structures/Command.js";
import { KaraokeQueue, KaraokeSettings } from "../../schemas/karaoke.js";
import { EmbedBuilder } from 'discord.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const emoji = require("../../data/emoji.json");

export default class JoinQueue extends Command {
    constructor(client) {
        super(client, {
            name: 'joinqueue',
            description: {
                content: 'Join the karaoke queue',
                usage: '',
                examples: ['joinqueue', 'jq'],
            },
            aliases: ['jq', 'qjoin'],
            category: 'karaoke',
            cooldown: 3,
            permissions: {
                dev: false,
                client: ['SendMessages', 'ViewChannel', 'EmbedLinks'],
                user: [],
            },
            slashCommand: false // Prefix command only
        });
    }

    async run(ctx) {
        const settings = await KaraokeSettings.findOne({ guildId: ctx.guild.id }).catch(() => null);
        if (!settings?.isConfigured) {
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle(`${emoji.status.error} Not Configured`)
                .setDescription(`Karaoke system is not configured.\nUse \`/karaoke-setup wizard\` first.`);
            return ctx.sendMessage({ embeds: [embed] });
        }

        const session = await KaraokeQueue.findOne({ 
            guildId: ctx.guild.id, 
            isActive: true 
        }).catch(() => null);

        if (!session) {
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle(`${emoji.status.error} No Active Session`)
                .setDescription(`No active karaoke session.\nAsk an Event Manager to start one!`);
            return ctx.sendMessage({ embeds: [embed] });
        }

        // Check if queue is locked
        if (session.isLocked) {
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle(`${emoji.status.error} Queue Locked`)
                .setDescription(`The queue is currently **locked**.\nPlease wait for an Event Manager to unlock it.`);
            return ctx.sendMessage({ embeds: [embed] });
        }

        // Check if user is already in the queue or currently singing
        const isCurrentSinger = session.currentSinger?.userId === ctx.author.id;
        const isAlreadyInQueue = session.queue.some(q => q.userId === ctx.author.id);
        
        if (isCurrentSinger) {
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle(`${emoji.status.error} Already Singing`)
                .setDescription(`You are currently singing!\nUse \`.leavequeue\` if you want to stop.`);
            return ctx.sendMessage({ embeds: [embed] });
        }
        
        if (isAlreadyInQueue) {
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle(`${emoji.status.error} Already In Queue`)
                .setDescription(`You are already in the queue!\nUse \`.leavequeue\` to leave first.`);
            return ctx.sendMessage({ embeds: [embed] });
        }

        // Check max queue per user (if configured)
        const maxPerUser = session.settings?.maxQueuePerUser || 2;
        const userQueueCount = session.queue.filter(q => q.userId === ctx.author.id).length;
        if (userQueueCount >= maxPerUser) {
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle(`${emoji.status.error} Queue Limit Reached`)
                .setDescription(`You can only have ${maxPerUser} ${maxPerUser === 1 ? 'song' : 'songs'} in the queue at a time.`);
            return ctx.sendMessage({ embeds: [embed] });
        }

        // Add to queue - no song name required
        // If no one is currently singing, make this person the current singer
        // Check both null and empty object (Mongoose quirk)
        const hasCurrentSinger = session.currentSinger && session.currentSinger.userId;
        console.log('🎤 DEBUG: Current singer check:', session.currentSinger, 'Has singer?', hasCurrentSinger);
        
        if (!hasCurrentSinger) {
            console.log('🎤 DEBUG: Making first joiner the current singer:', ctx.author.username);
            session.currentSinger = {
                userId: ctx.author.id,
                username: ctx.author.username,
                songId: null,
                songTitle: null,
                startedAt: new Date()
            };
            await session.save().catch(() => {});

            // Unmute the singer
            if (settings.voiceChannelId) {
                try {
                    const member = await ctx.guild.members.fetch(ctx.author.id).catch(() => null);
                    if (member?.voice?.channelId === settings.voiceChannelId) {
                        await member.voice.setMute(false, 'Karaoke: Your turn to sing!').catch(() => {});
                    }
                } catch (e) {}
            }

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle(`${emoji.status.success} You're Up First!`)
                .setDescription(
                    `${emoji.karaoke.singing} **You're now singing!**\n` +
                    `${emoji.karaoke.speaker} You've been unmuted!\n\n` +
                    `*It's your time to shine!*`
                );

            return ctx.sendMessage({ embeds: [embed] });
        }

        // Otherwise, add to waiting queue
        console.log('🎤 DEBUG: Adding to waiting queue, current singer exists');
        session.queue.push({
            userId: ctx.author.id,
            username: ctx.author.username,
            songId: null,
            songTitle: null,
            addedAt: new Date()
        });
        await session.save().catch(() => {});

        const position = session.queue.length;
        const estWait = (position - 1) * 4;

        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle(`${emoji.status.success} You're In The Queue!`)
            .setDescription(
                `${emoji.karaoke.position} **Position:** #${position}\n` +
                `${emoji.karaoke.timer} **Estimated wait:** ~${estWait} min\n\n` +
                `*You'll be unmuted when it's your turn!*`
            );

        return ctx.sendMessage({ embeds: [embed] });
    }
}
