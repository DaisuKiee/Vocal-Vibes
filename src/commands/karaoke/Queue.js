import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder } from 'discord.js';
import Command from "../../structures/Command.js";
import { KaraokeQueue, Song, KaraokeSettings } from "../../schemas/karaoke.js";
import { Premium } from "../../schemas/premium.js";
import TTSAnnouncer from "../../utils/TTSAnnouncer.js";
import { getVoiceConnection } from '@discordjs/voice';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const emoji = require("../../data/emoji.json");

export default class Queue extends Command {
    constructor(client) {
        super(client, {
            name: 'queue',
            description: {
                content: 'Manage the karaoke queue - add, remove, or view entries',
                usage: '<add|remove|view|skip|clear>',
                examples: ['queue add song123', 'queue remove', 'queue view'],
            },
            aliases: ['queue'],
            category: 'karaoke',
            cooldown: 3,
            permissions: {
                dev: false,
                client: ['SendMessages', 'ViewChannel', 'EmbedLinks'],
                user: [],
            },
            slashCommand: true,
            options: [
                {
                    name: 'add',
                    description: 'Add yourself to the queue with a song',
                    type: 1,
                    options: [
                        {
                            name: 'song',
                            description: 'Song ID or title to sing',
                            type: 3,
                            required: true,
                            autocomplete: true
                        }
                    ]
                },
                {
                    name: 'remove',
                    description: 'Remove yourself from the queue',
                    type: 1
                },
                {
                    name: 'kick',
                    description: 'Remove a user from the queue (Event Manager only)',
                    type: 1,
                    options: [
                        {
                            name: 'user',
                            description: 'User to remove from queue',
                            type: 6,
                            required: true
                        }
                    ]
                },
                {
                    name: 'view',
                    description: 'View the current queue',
                    type: 1
                },
                {
                    name: 'lock',
                    description: 'Lock/unlock the queue (Event Manager only)',
                    type: 1
                },
                {
                    name: 'skip',
                    description: 'Skip to the next singer (Event Manager only)',
                    type: 1
                },
                {
                    name: 'clear',
                    description: 'Clear the entire queue (Event Manager only)',
                    type: 1
                }
            ]
        });
    }

    async run(ctx, args) {
        const subcommand = ctx.isInteraction ? ctx.interaction.options.getSubcommand() : args[0]?.toLowerCase();

        switch (subcommand) {
            case 'add':
                return this.addToQueue(ctx, args);
            case 'remove':
                return this.removeFromQueue(ctx);
            case 'kick':
                return this.kickFromQueue(ctx, args);
            case 'view':
                return this.viewQueue(ctx);
            case 'lock':
                return this.lockQueue(ctx);
            case 'skip':
                return this.skipSinger(ctx);
            case 'clear':
                return this.clearQueue(ctx);
            default:
                return this.viewQueue(ctx);
        }
    }

    async addToQueue(ctx, args) {
        const session = await KaraokeQueue.findOne({ 
            guildId: ctx.guild.id, 
            isActive: true 
        }).catch(() => null);

        if (!session) {
            return ctx.sendMessage({
                content: `${emoji.status.error} No active karaoke session. Start one with \`/karaoke start\`!`,
                flags: 64
            });
        }

        // Check if queue is locked
        if (session.isLocked) {
            return ctx.sendMessage({
                content: `${emoji.status.error} The queue is currently **locked**. Please wait for an Event Manager to unlock it.`,
                flags: 64
            });
        }

        const songQuery = ctx.isInteraction 
            ? ctx.interaction.options.getString('song') 
            : args.slice(1).join(' ');

        if (!songQuery) {
            return ctx.sendMessage({
                content: `${emoji.status.error} Please specify a song! Use \`/songs\` to browse available songs.`,
                flags: 64
            });
        }

        const song = await Song.findOne({
            $or: [
                { songId: songQuery },
                { title: { $regex: songQuery, $options: 'i' } }
            ]
        }).catch(() => null);

        if (!song) {
            return ctx.sendMessage({
                content: `${emoji.status.error} Song "${songQuery}" not found. Use \`/songs\` to browse or \`/songs add\` to add new songs.`,
                flags: 64
            });
        }

        // Check if user is already in the queue
        const isAlreadyInQueue = session.queue.some(q => q.userId === ctx.author.id);
        if (isAlreadyInQueue) {
            return ctx.sendMessage({
                content: `${emoji.status.error} You are already in the queue! Use \`/queue remove\` to leave first.`,
                flags: 64
            });
        }

        session.queue.push({
            userId: ctx.author.id,
            username: ctx.author.username,
            songId: song.songId,
            songTitle: song.title,
            addedAt: new Date()
        });
        await session.save().catch(() => {});

        const position = session.queue.length;

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('queue_view')
                .setLabel('View Queue')
                .setStyle(ButtonStyle.Primary)
                .setEmoji(emoji.karaoke.queue),
            new ButtonBuilder()
                .setCustomId(`queue_remove_${ctx.author.id}`)
                .setLabel('Leave Queue')
                .setStyle(ButtonStyle.Danger)
                .setEmoji(emoji.status.error)
        );

        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${emoji.status.success} Added to Queue!`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `**${ctx.author.username}** is queued to sing!\n\n` +
                `${emoji.karaoke.music} **Song:** ${song.title}\n` +
                `${emoji.karaoke.microphone} **Artist:** ${song.artist}\n` +
                `${emoji.karaoke.position} **Position:** #${position} in queue\n` +
                `${emoji.karaoke.timer} **Estimated wait:** ~${(position - 1) * 4} minutes`
            ))
            .addActionRowComponents(row);

        return ctx.sendMessage({ components: [container], flags: 32768 });
    }

    async removeFromQueue(ctx) {
        const session = await KaraokeQueue.findOne({ 
            guildId: ctx.guild.id, 
            isActive: true 
        }).catch(() => null);

        if (!session) {
            return ctx.sendMessage({ content: `${emoji.status.error} No active karaoke session.`, flags: 64 });
        }

        const userIndex = session.queue.findIndex(q => q.userId === ctx.author.id);
        if (userIndex === -1) {
            return ctx.sendMessage({ content: `${emoji.status.error} You are not in the queue.`, flags: 64 });
        }

        const removed = session.queue.splice(userIndex, 1)[0];
        await session.save().catch(() => {});

        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('# 👋 Removed from Queue'))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `**${ctx.author.username}** left the queue.\n\n` +
                `${emoji.karaoke.music} **Song:** ${removed.songTitle}\n` +
                `${emoji.karaoke.queue} **Queue size:** ${session.queue.length} remaining`
            ));

        return ctx.sendMessage({ components: [container], flags: 32768 });
    }

    async kickFromQueue(ctx, args) {
        // Check for event manager permission
        const settings = await KaraokeSettings.findOne({ guildId: ctx.guild.id }).catch(() => null);
        const isEventManager = settings?.eventManagerRoleId && ctx.member.roles.cache.has(settings.eventManagerRoleId);
        const isAdmin = ctx.member.permissions.has('ManageChannels');
        
        if (!isEventManager && !isAdmin) {
            return ctx.sendMessage({
                content: `${emoji.status.error} You need the Event Manager role to remove users from the queue.`,
                flags: 64
            });
        }

        const session = await KaraokeQueue.findOne({ 
            guildId: ctx.guild.id, 
            isActive: true 
        }).catch(() => null);

        if (!session) {
            return ctx.sendMessage({ content: `${emoji.status.error} No active karaoke session.`, flags: 64 });
        }

        // Get target user
        const targetUser = ctx.isInteraction 
            ? ctx.interaction.options.getUser('user')
            : ctx.message.mentions.users.first() || await this.client.users.fetch(args[1]).catch(() => null);

        if (!targetUser) {
            return ctx.sendMessage({ content: `${emoji.status.error} Please specify a user to remove.`, flags: 64 });
        }

        const userIndex = session.queue.findIndex(q => q.userId === targetUser.id);
        if (userIndex === -1) {
            return ctx.sendMessage({ content: `${emoji.status.error} **${targetUser.username}** is not in the queue.`, flags: 64 });
        }

        const removed = session.queue.splice(userIndex, 1)[0];
        await session.save().catch(() => {});

        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${emoji.status.warning} User Removed from Queue`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `**${removed.username}** was removed from the queue by ${ctx.author.username}.\n\n` +
                `${emoji.karaoke.music} **Song:** ${removed.songTitle}\n` +
                `${emoji.karaoke.queue} **Queue size:** ${session.queue.length} remaining`
            ));

        return ctx.sendMessage({ components: [container], flags: 32768 });
    }

    async lockQueue(ctx) {
        // Check for event manager permission
        const settings = await KaraokeSettings.findOne({ guildId: ctx.guild.id }).catch(() => null);
        const isEventManager = settings?.eventManagerRoleId && ctx.member.roles.cache.has(settings.eventManagerRoleId);
        const isAdmin = ctx.member.permissions.has('ManageChannels');
        
        if (!isEventManager && !isAdmin) {
            return ctx.sendMessage({
                content: `${emoji.status.error} You need the Event Manager role to lock/unlock the queue.`,
                flags: 64
            });
        }

        const session = await KaraokeQueue.findOne({ 
            guildId: ctx.guild.id, 
            isActive: true 
        }).catch(() => null);

        if (!session) {
            return ctx.sendMessage({ content: `${emoji.status.error} No active karaoke session.`, flags: 64 });
        }

        // Toggle lock status
        session.isLocked = !session.isLocked;
        await session.save().catch(() => {});

        const lockStatus = session.isLocked;
        const lockEmoji = lockStatus ? '🔒' : '🔓';
        const lockText = lockStatus ? 'locked' : 'unlocked';

        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${lockEmoji} Queue ${lockStatus ? 'Locked' : 'Unlocked'}`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `The queue has been **${lockText}** by ${ctx.author.username}.\n\n` +
                (lockStatus 
                    ? `${emoji.status.warning} No one can join the queue until it's unlocked.`
                    : `${emoji.status.success} Users can now join the queue again!`)
            ));

        return ctx.sendMessage({ components: [container], flags: 32768 });
    }

    async viewQueue(ctx) {
        const session = await KaraokeQueue.findOne({ 
            guildId: ctx.guild.id, 
            isActive: true 
        }).catch(() => null);

        if (!session) {
            return ctx.sendMessage({
                content: `${emoji.status.error} No active karaoke session. Start one with \`/karaoke start\`!`,
                flags: 64
            });
        }

        // Check 10-second cooldown for queue resend
        const now = new Date();
        if (session.queueResendCooldown && now < new Date(session.queueResendCooldown)) {
            const remaining = Math.ceil((new Date(session.queueResendCooldown) - now) / 1000);
            return ctx.sendMessage({ 
                content: `${emoji.status.warning} Queue display is on cooldown. Try again in **${remaining}s**.`, 
                flags: 64 
            });
        }

        // Set 10-second cooldown
        session.queueResendCooldown = new Date(now.getTime() + 10000);
        await session.save().catch(() => {});

        let queueContent = '';
        
        // Show lock status
        if (session.isLocked) {
            queueContent += `🔒 **Queue is LOCKED** - No new entries allowed\n\n`;
        }
        
        if (session.currentSinger?.userId) {
            queueContent += `${emoji.karaoke.singing} **NOW SINGING:**\n<@${session.currentSinger.userId}> - ${session.currentSinger.songTitle}\n\n`;
        }

        if (session.queue.length === 0) {
            queueContent += `${emoji.karaoke.queue} **Queue is empty!**\n${session.isLocked ? '*Queue is locked by Event Manager*' : 'Use `/queue add` to join!'}`;
        } else {
            queueContent += `${emoji.karaoke.queue} **Up Next:**\n`;
            session.queue.slice(0, 10).forEach((q, i) => {
                queueContent += `${i + 1}. <@${q.userId}> - **${q.songTitle}**\n`;
            });
            if (session.queue.length > 10) {
                queueContent += `\n... and ${session.queue.length - 10} more`;
            }
        }

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('karaoke_join')
                .setLabel('Join Queue')
                .setStyle(ButtonStyle.Success)
                .setEmoji('➕')
                .setDisabled(session.isLocked),
            new ButtonBuilder()
                .setCustomId('songs_list')
                .setLabel('Browse Songs')
                .setStyle(ButtonStyle.Primary)
                .setEmoji(emoji.karaoke.book),
            new ButtonBuilder()
                .setCustomId('queue_full')
                .setLabel('Full Queue')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji(emoji.karaoke.queue),
            new ButtonBuilder()
                .setCustomId('karaoke_next')
                .setLabel('Next')
                .setStyle(ButtonStyle.Danger)
                .setEmoji(emoji.karaoke.next)
        );

        // Add View Lyrics button if there's a current singer
        const rows = [row];
        if (session.currentSinger?.userId) {
            const lyricsRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('view_lyrics')
                    .setLabel('View Lyrics')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('📜')
            );
            rows.push(lyricsRow);
        }

        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${emoji.karaoke.microphone} Karaoke Queue${session.isLocked ? ' 🔒' : ''}`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(queueContent));
        
        rows.forEach(r => container.addActionRowComponents(r));

        return ctx.sendMessage({ components: [container], flags: 32768 });
    }

    async skipSinger(ctx) {
        // Check for event manager permission
        const settings = await KaraokeSettings.findOne({ guildId: ctx.guild.id }).catch(() => null);
        const isEventManager = settings?.eventManagerRoleId && ctx.member.roles.cache.has(settings.eventManagerRoleId);
        const isAdmin = ctx.member.permissions.has('ManageChannels');
        
        if (!isEventManager && !isAdmin) {
            return ctx.sendMessage({
                content: `${emoji.status.error} You need Event Manager role to skip singers.`,
                flags: 64
            });
        }

        const session = await KaraokeQueue.findOne({ 
            guildId: ctx.guild.id, 
            isActive: true 
        }).catch(() => null);

        if (!session) {
            return ctx.sendMessage({ content: `${emoji.status.error} No active karaoke session.`, flags: 64 });
        }

        const previousSinger = session.currentSinger;
        
        // Mute the previous singer (if they're in VC)
        if (previousSinger?.userId && settings?.voiceChannelId) {
            try {
                const member = await ctx.guild.members.fetch(previousSinger.userId).catch(() => null);
                if (member?.voice?.channelId === settings.voiceChannelId) {
                    await member.voice.setMute(true, 'Karaoke: Finished singing').catch(() => {});
                }
            } catch (e) {}
        }
        
        // Get next singer
        if (session.queue.length > 0) {
            const nextUp = session.queue.shift();
            
            // Fetch song details including lyrics
            const songDetails = await Song.findOne({ songId: nextUp.songId }).catch(() => null);
            
            session.currentSinger = {
                userId: nextUp.userId,
                username: nextUp.username,
                songId: nextUp.songId,
                songTitle: nextUp.songTitle,
                lyrics: songDetails?.lyrics || null,
                startedAt: new Date()
            };
            
            // Unmute the next singer
            if (settings?.voiceChannelId) {
                try {
                    const member = await ctx.guild.members.fetch(nextUp.userId).catch(() => null);
                    if (member?.voice?.channelId === settings.voiceChannelId) {
                        await member.voice.setMute(false, 'Karaoke: Your turn to sing!').catch(() => {});
                    }
                } catch (e) {}
            }
            
            // AI Voice Announcement (Premium Feature)
            try {
                const premium = await Premium.findOne({ guildId: ctx.guild.id });
                if (premium?.features?.aiAnnouncer) {
                    const connection = getVoiceConnection(ctx.guild.id);
                    if (connection) {
                        await TTSAnnouncer.announceNextSinger(
                            connection,
                            nextUp.username,
                            nextUp.songTitle
                        );
                    }
                }
            } catch (err) {
                console.error('AI Announcer error:', err.message);
            }
        } else {
            session.currentSinger = null;
        }
        
        // Store previous singer
        if (previousSinger?.userId) {
            session.lastSinger = {
                userId: previousSinger.userId,
                username: previousSinger.username,
                songId: previousSinger.songId,
                songTitle: previousSinger.songTitle,
                finishedAt: new Date()
            };
        }
        
        await session.save().catch(() => {});

        // Build the message content
        let messageContent = '';
        
        // Thank the previous singer if there was one
        if (previousSinger?.userId) {
            messageContent += `${emoji.karaoke.party} **Thank you, <@${previousSinger.userId}>!**\n`;
            messageContent += `${emoji.karaoke.music} *${previousSinger.songTitle}*\n\n`;
            messageContent += `${emoji.misc.divider}\n\n`;
        }
        
        // Show the next singer
        if (session.currentSinger) {
            messageContent += `${emoji.karaoke.singing} **Now singing:** <@${session.currentSinger.userId}>\n`;
            messageContent += `${emoji.karaoke.music} **Song:** ${session.currentSinger.songTitle}\n\n`;
            messageContent += `${emoji.karaoke.speaker} *You've been unmuted - it's your time to shine!*\n\n`;
            messageContent += `${emoji.karaoke.queue} **${session.queue.length}** singers remaining in queue`;
        } else {
            messageContent += `${emoji.karaoke.queue} Queue is now empty!\nUse \`/queue add\` to join!`;
        }

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('karaoke_next')
                .setLabel('Next Singer')
                .setStyle(ButtonStyle.Primary)
                .setEmoji(emoji.karaoke.next),
            new ButtonBuilder()
                .setCustomId('karaoke_queue')
                .setLabel('View Queue')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji(emoji.karaoke.queue)
        );

        // Add View Lyrics button if there's a current singer
        const rows = [row];
        if (session.currentSinger?.userId) {
            const lyricsRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('view_lyrics')
                    .setLabel('View Lyrics')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('📜')
            );
            rows.push(lyricsRow);
        }

        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${emoji.karaoke.microphone} Up Next!`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(messageContent));
        
        rows.forEach(r => container.addActionRowComponents(r));

        return ctx.sendMessage({ components: [container], flags: 32768 });
    }

    async clearQueue(ctx) {
        if (!ctx.member.permissions.has('ManageChannels')) {
            return ctx.sendMessage({
                content: `${emoji.status.error} You need \`Manage Channels\` permission to clear the queue.`,
                flags: 64
            });
        }

        const session = await KaraokeQueue.findOne({ 
            guildId: ctx.guild.id, 
            isActive: true 
        }).catch(() => null);

        if (!session) {
            return ctx.sendMessage({ content: `${emoji.status.error} No active karaoke session.`, flags: 64 });
        }

        const clearedCount = session.queue.length;
        session.queue = [];
        await session.save().catch(() => {});

        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('# 🗑️ Queue Cleared'))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `Removed **${clearedCount}** entries from the queue.\n\nThe queue is now empty. Use \`/queue add\` to join!`
            ));

        return ctx.sendMessage({ components: [container], flags: 32768 });
    }
}
