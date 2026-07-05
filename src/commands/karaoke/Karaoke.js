import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder } from 'discord.js';
import { joinVoiceChannel, VoiceConnectionStatus, entersState, getVoiceConnection } from '@discordjs/voice';
import Command from "../../structures/Command.js";
import { KaraokeQueue, KaraokeSettings } from "../../schemas/karaoke.js";
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const emoji = require("../../data/emoji.json");

// Helper to ensure bot is connected to voice channel (auto-reconnect)
async function ensureVoiceConnection(guild, voiceChannelId) {
    try {
        let connection = getVoiceConnection(guild.id);
        
        // If no connection or disconnected, reconnect
        if (!connection || connection.state.status === VoiceConnectionStatus.Destroyed || 
            connection.state.status === VoiceConnectionStatus.Disconnected) {
            
            connection = joinVoiceChannel({
                channelId: voiceChannelId,
                guildId: guild.id,
                adapterCreator: guild.voiceAdapterCreator,
                selfDeaf: false,
                selfMute: true
            });

            // Set up auto-reconnect on disconnect
            connection.on(VoiceConnectionStatus.Disconnected, async () => {
                try {
                    // Try to reconnect within 5 seconds
                    await Promise.race([
                        entersState(connection, VoiceConnectionStatus.Signalling, 5000),
                        entersState(connection, VoiceConnectionStatus.Connecting, 5000),
                    ]);
                    // Seems to be reconnecting
                } catch (e) {
                    // Check if session is still active before reconnecting
                    const session = await KaraokeQueue.findOne({ guildId: guild.id, isActive: true }).catch(() => null);
                    if (session) {
                        // Session still active, try to rejoin
                        try {
                            connection.destroy();
                            joinVoiceChannel({
                                channelId: voiceChannelId,
                                guildId: guild.id,
                                adapterCreator: guild.voiceAdapterCreator,
                                selfDeaf: false,
                                selfMute: true
                            });
                        } catch (err) {
                            console.error('Failed to reconnect to voice:', err.message);
                        }
                    }
                }
            });

            // Wait for ready state
            try {
                await entersState(connection, VoiceConnectionStatus.Ready, 15000);
                return { connected: true, connection };
            } catch (e) {
                if (connection.state.status === VoiceConnectionStatus.Ready) {
                    return { connected: true, connection };
                }
                return { connected: false, connection };
            }
        }
        
        return { connected: connection.state.status === VoiceConnectionStatus.Ready, connection };
    } catch (error) {
        console.error('Voice connection error:', error.message);
        return { connected: false, connection: null };
    }
}

export default class Karaoke extends Command {
    constructor(client) {
        super(client, {
            name: 'karaoke',
            description: {
                content: 'Start, stop, or check karaoke session status',
                usage: '<start|stop|status>',
                examples: ['karaoke start', 'karaoke stop', 'karaoke status'],
            },
            aliases: ['ktv', 'sing'],
            category: 'karaoke',
            cooldown: 3,
            permissions: {
                dev: false,
                client: ['SendMessages', 'ViewChannel', 'EmbedLinks', 'MuteMembers', 'Connect'],
                user: [],
            },
            slashCommand: true,
            options: [
                {
                    name: 'start',
                    description: 'Start a karaoke session',
                    type: 1
                },
                {
                    name: 'stop',
                    description: 'Stop the current karaoke session',
                    type: 1
                },
                {
                    name: 'status',
                    description: 'View current karaoke session status',
                    type: 1
                }
            ]
        });
    }

    async run(ctx, args) {
        // Defer reply immediately to prevent timeout (slash commands only)
        if (ctx.isInteraction) {
            await ctx.interaction.deferReply().catch(() => {});
        }
        
        const subcommand = ctx.isInteraction ? ctx.interaction.options.getSubcommand() : args[0]?.toLowerCase();

        try {
            switch (subcommand) {
                case 'start':
                    return await this.startSession(ctx);
                case 'stop':
                    return await this.stopSession(ctx);
                case 'status':
                    return await this.showStatus(ctx);
                default:
                    return await this.showStatus(ctx);
            }
        } catch (error) {
            // Suppress SSL errors and show generic message
            if (error?.code === 'ERR_SSL_SSLV3_ALERT_HANDSHAKE_FAILURE') {
                const errorMsg = { content: `${emoji.status.error} Database connection issue. Please try again in a moment.` };
                return this.reply(ctx, errorMsg);
            }
            console.error('Karaoke command error:', error);
            const errorMsg = { content: `${emoji.status.error} An error occurred. Please try again.` };
            return this.reply(ctx, errorMsg);
        }
    }

    async checkEventManagerPermission(ctx) {
        const settings = await KaraokeSettings.findOne({ guildId: ctx.guild.id }).maxTimeMS(5000).catch(() => null);
        if (!settings) return ctx.member.permissions.has('Administrator');
        
        // Check if user has event manager role or is admin
        if (settings.eventManagerRoleId) {
            const hasRole = ctx.member.roles.cache.has(settings.eventManagerRoleId);
            const isAdmin = ctx.member.permissions.has('Administrator');
            return hasRole || isAdmin;
        }
        
        return ctx.member.permissions.has('ManageChannels');
    }

    async reply(ctx, content) {
        if (ctx.isInteraction) {
            if (ctx.interaction.deferred || ctx.interaction.replied) {
                return ctx.interaction.editReply(content).catch(() => {});
            }
            return ctx.interaction.reply(content).catch(() => {});
        }
        return ctx.sendMessage(content);
    }

    async startSession(ctx) {
        const settings = await KaraokeSettings.findOne({ guildId: ctx.guild.id }).maxTimeMS(5000).catch(() => null);
        
        // Check permission
        const canStart = await this.checkEventManagerPermission(ctx);
        if (!canStart) {
            return this.reply(ctx, {
                content: `${emoji.status.error} You need the Event Manager role to start karaoke!${settings?.eventManagerRoleId ? ` (<@&${settings.eventManagerRoleId}>)` : ''}`,
                flags: 64
            });
        }

        // Check for existing session
        const existingSession = await KaraokeQueue.findOne({ guildId: ctx.guild.id, isActive: true }).maxTimeMS(5000).catch(() => null);
        if (existingSession) {
            return this.reply(ctx, {
                content: `${emoji.karaoke.microphone} A karaoke session is already active! Use \`/karaoke status\` to view it.`,
                flags: 64
            });
        }

        // Check if voice channel is configured
        if (!settings?.voiceChannelId) {
            return this.reply(ctx, {
                content: `${emoji.status.error} No voice channel configured! Run \`/karaoke-setup\` first.`,
                flags: 64
            });
        }

        // Join the voice channel with auto-reconnect
        const { connected: voiceConnected } = await ensureVoiceConnection(ctx.guild, settings.voiceChannelId);

        // Create session
        await KaraokeQueue.create({
            guildId: ctx.guild.id,
            channelId: settings.karaokeChannelId || ctx.channel.id,
            voiceChannelId: settings.voiceChannelId,
            isActive: true,
            queue: [],
            settings: {
                maxQueuePerUser: 2,
                autoMuteAudience: settings.autoMuteEnabled ?? true,
                allowRatings: true
            }
        }).catch(() => null);

        // Mute everyone currently in the voice channel (except Event Managers)
        if (settings?.autoMuteEnabled) {
            try {
                const voiceChannel = await ctx.guild.channels.fetch(settings.voiceChannelId);
                if (voiceChannel) {
                    for (const [, member] of voiceChannel.members) {
                        if (!member.user.bot && !member.roles.cache.has(settings.eventManagerRoleId)) {
                            await member.voice.setMute(true, 'Karaoke session started').catch(() => {});
                        }
                    }
                }
            } catch (e) {
                console.error('Failed to mute audience:', e);
            }
        }

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('karaoke_songs').setLabel(`${emoji.karaoke.book} Browse Songs`).setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('karaoke_join').setLabel(`Join Queue`).setEmoji('1457196702397108347').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('karaoke_queue').setLabel(`${emoji.karaoke.queue} View Queue`).setStyle(ButtonStyle.Secondary)
        );

        const voiceStatus = voiceConnected ? `${emoji.status.success} Connected` : `${emoji.status.warning} Join manually`;

        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${emoji.karaoke.microphone} Karaoke Night Started!`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `**Welcome to Karaoke Night!** ${emoji.karaoke.party}\n\n` +
                `${emoji.karaoke.tv} **Text Channel:** <#${settings?.karaokeChannelId || ctx.channel.id}>\n` +
                `${emoji.karaoke.speaker} **Voice Channel:** <#${settings.voiceChannelId}> ${voiceStatus}\n\n` +
                `${emoji.misc.divider}\n\n` +
                `**${emoji.karaoke.queue} How to Participate:**\n` +
                `1. Join the voice channel (you'll be muted)\n` +
                `2. Click **Browse Songs** to find a song\n` +
                `3. Click **Join Queue** to sign up\n` +
                `4. When it's your turn, you'll be unmuted!\n` +
                `5. Sing your heart out! ${emoji.karaoke.music}\n\n` +
                `*Event Manager: Use \`/karaoke stop\` to end the session*`
            ))
            .addActionRowComponents(row);

        return this.reply(ctx, { components: [container], flags: 32768 });
    }

    async stopSession(ctx) {
        const canStop = await this.checkEventManagerPermission(ctx);
        if (!canStop) {
            return this.reply(ctx, {
                content: `${emoji.status.error} You need Event Manager role to stop the session.`,
                flags: 64
            });
        }

        const session = await KaraokeQueue.findOne({ guildId: ctx.guild.id, isActive: true }).maxTimeMS(5000).catch(() => null);
        if (!session) {
            return this.reply(ctx, { content: `${emoji.status.error} No active karaoke session.`, flags: 64 });
        }

        session.isActive = false;
        await session.save().catch(() => {});

        // Unmute everyone in the voice channel and disconnect bot
        const settings = await KaraokeSettings.findOne({ guildId: ctx.guild.id }).maxTimeMS(5000).catch(() => null);
        if (settings?.voiceChannelId) {
            try {
                const voiceChannel = await ctx.guild.channels.fetch(settings.voiceChannelId);
                if (voiceChannel) {
                    // Unmute all members
                    for (const [, member] of voiceChannel.members) {
                        if (!member.user.bot && member.voice.serverMute) {
                            await member.voice.setMute(false, 'Karaoke session ended').catch(() => {});
                        }
                    }
                }
                
                // Disconnect bot from voice
                const connection = getVoiceConnection(ctx.guild.id);
                if (connection) {
                    connection.destroy();
                }
            } catch (e) {
                console.error('Failed to cleanup voice:', e);
            }
        }

        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${emoji.karaoke.microphone} Karaoke Night Ended!`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `**Thanks for singing with us!** ${emoji.karaoke.party}\n\n` +
                `${emoji.misc.chart} **Total in queue:** ${session.queue.length}\n` +
                `${emoji.karaoke.timer} **Duration:** ${this.formatDuration(Date.now() - session.createdAt)}\n\n` +
                `*All audience members have been unmuted.*`
            ));

        return this.reply(ctx, { components: [container], flags: 32768 });
    }

    async showStatus(ctx) {
        // Check permission for status command
        const canAccess = await this.checkEventManagerPermission(ctx);
        if (!canAccess) {
            const settings = await KaraokeSettings.findOne({ guildId: ctx.guild.id }).maxTimeMS(5000).catch(() => null);
            return this.reply(ctx, {
                content: `${emoji.status.error} You need the Event Manager role to use karaoke commands!${settings?.eventManagerRoleId ? ` (<@&${settings.eventManagerRoleId}>)` : ''}`,
                flags: 64
            });
        }

        const session = await KaraokeQueue.findOne({ guildId: ctx.guild.id, isActive: true }).maxTimeMS(5000).catch(() => null);

        if (!session) {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('karaoke_start').setLabel(`${emoji.karaoke.microphone} Start Session`).setStyle(ButtonStyle.Success)
            );

            const container = new ContainerBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${emoji.karaoke.microphone} Karaoke Status`))
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    '**No active session**\n\nEvent Manager can start one with `/karaoke start`!'
                ))
                .addActionRowComponents(row);

            return this.reply(ctx, { components: [container], flags: 32768 });
        }

        const queueList = session.queue.length > 0
            ? session.queue.slice(0, 5).map((q, i) => `${i + 1}. **${q.username}** - ${q.songTitle}`).join('\n')
            : 'Queue is empty - be the first to join!';

        const currentSinger = session.currentSinger?.userId
            ? `${emoji.karaoke.singing} **Now Singing:** <@${session.currentSinger.userId}>\n${emoji.karaoke.music} **Song:** ${session.currentSinger.songTitle}`
            : `${emoji.karaoke.singing} **Now Singing:** Waiting for first singer...`;

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('karaoke_songs').setLabel(`${emoji.karaoke.book} Songs`).setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('karaoke_join').setLabel(`${emoji.karaoke.microphone} Join`).setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('karaoke_next').setLabel(`${emoji.karaoke.next} Next`).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('karaoke_queue').setLabel(`${emoji.karaoke.queue} Queue`).setStyle(ButtonStyle.Secondary)
        );

        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${emoji.karaoke.microphone} Karaoke Status`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `${currentSinger}\n\n` +
                `**${emoji.karaoke.queue} Queue (${session.queue.length} waiting):**\n${queueList}\n\n` +
                `${session.voiceChannelId ? `${emoji.karaoke.speaker} Voice: <#${session.voiceChannelId}>` : ''}`
            ))
            .addActionRowComponents(row);

        return this.reply(ctx, { components: [container], flags: 32768 });
    }

    formatDuration(ms) {
        const hours = Math.floor(ms / 3600000);
        const minutes = Math.floor((ms % 3600000) / 60000);
        if (hours > 0) return `${hours}h ${minutes}m`;
        return `${minutes}m`;
    }
}
