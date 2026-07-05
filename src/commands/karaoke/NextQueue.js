import Command from "../../structures/Command.js";
import { KaraokeQueue, Song, KaraokeSettings } from "../../schemas/karaoke.js";
import { EmbedBuilder } from 'discord.js';
import { getVoiceConnection } from '@discordjs/voice';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const emoji = require("../../data/emoji.json");

export default class NextQueue extends Command {
    constructor(client) {
        super(client, {
            name: 'nextqueue',
            description: {
                content: 'Move to the next person in the queue (Event Manager only)',
                usage: '',
                examples: ['nextqueue'],
            },
            aliases: ['qnext', 'skipqueue', 'next', 'nq'],
            category: 'karaoke',
            cooldown: 3,
            permissions: {
                dev: false,
                client: ['SendMessages', 'ViewChannel', 'EmbedLinks', 'MuteMembers'],
                user: [],
            },
            slashCommand: false // Prefix command only
        });
    }

    async run(ctx) {
        // Check for Event Manager permission
        const settings = await KaraokeSettings.findOne({ guildId: ctx.guild.id }).catch(() => null);
        if (!settings?.isConfigured) {
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle(`${emoji.status.error} Not Configured`)
                .setDescription(`Karaoke system is not configured.`);
            return ctx.sendMessage({ embeds: [embed] });
        }

        const isEventManager = settings.eventManagerRoleId && ctx.member.roles.cache.has(settings.eventManagerRoleId);
        const isAdmin = ctx.member.permissions.has('ManageChannels');
        
        if (!isEventManager && !isAdmin) {
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle(`${emoji.status.error} Permission Denied`)
                .setDescription(`Only Event Managers can skip to the next singer.`);
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
                .setDescription(`No active karaoke session.`);
            return ctx.sendMessage({ embeds: [embed] });
        }

        // Check command mode
        const commandMode = settings.commandMode || 'automatic';
        const isManualMode = commandMode === 'manual';

        const previousSinger = session.currentSinger;
        
        // Mute the previous singer
        if (previousSinger?.userId && settings.voiceChannelId) {
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
            
            // Fetch song details including lyrics (only in automatic mode)
            let songDetails = null;
            if (!isManualMode) {
                songDetails = await Song.findOne({ songId: nextUp.songId }).catch(() => null);
            }
            
            session.currentSinger = {
                userId: nextUp.userId,
                username: nextUp.username,
                songId: nextUp.songId,
                songTitle: nextUp.songTitle,
                lyrics: songDetails?.lyrics || null,
                startedAt: new Date()
            };
            
            // Unmute the next singer
            if (settings.voiceChannelId) {
                try {
                    const member = await ctx.guild.members.fetch(nextUp.userId).catch(() => null);
                    if (member?.voice?.channelId === settings.voiceChannelId) {
                        await member.voice.setMute(false, 'Karaoke: Your turn to sing!').catch(() => {});
                    }
                } catch (e) {}
            }
            
            // AI Voice Announcement (Premium Feature) - only in automatic mode
            if (!isManualMode) {
                try {
                    const { Premium } = await import('../../schemas/premium.js');
                    const premium = await Premium.findOne({ guildId: ctx.guild.id });
                    if (premium?.features?.aiAnnouncer) {
                        const connection = getVoiceConnection(ctx.guild.id);
                        if (connection) {
                            const TTSAnnouncer = (await import('../../utils/TTSAnnouncer.js')).default;
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

        // Build response using EmbedBuilder
        let messageContent = '';
        
        if (previousSinger?.userId) {
            messageContent += `${emoji.karaoke.party} **Thank you, <@${previousSinger.userId}>!**\n`;
            if (!isManualMode && previousSinger.songTitle) {
                messageContent += `${emoji.karaoke.music} *${previousSinger.songTitle}*\n`;
            }
            messageContent += `\n`;
        }
        
        if (session.currentSinger) {
            messageContent += `${emoji.karaoke.singing} **Now singing:** <@${session.currentSinger.userId}>\n`;
            if (!isManualMode && session.currentSinger.songTitle) {
                messageContent += `${emoji.karaoke.music} **Song:** ${session.currentSinger.songTitle}\n`;
            }
            messageContent += `\n${emoji.karaoke.speaker} *You've been unmuted - it's your time to shine!*\n\n`;
            messageContent += `${emoji.karaoke.queue} **${session.queue.length}** ${session.queue.length === 1 ? 'singer' : 'singers'} remaining in queue`;
        } else {
            messageContent += `${emoji.karaoke.queue} **Queue is now empty!**\n\n`;
            messageContent += `Use \`.joinqueue\` to join!`;
        }

        const embed = new EmbedBuilder()
            .setColor(session.currentSinger ? '#00FF00' : '#FFA500')
            .setTitle(`${emoji.karaoke.microphone} ${session.currentSinger ? 'Next Singer!' : 'Queue Empty'}`)
            .setDescription(messageContent)
            .setTimestamp();

        return ctx.sendMessage({ embeds: [embed] });
    }
}
