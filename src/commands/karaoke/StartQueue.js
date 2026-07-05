import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder } from 'discord.js';
import { joinVoiceChannel, VoiceConnectionStatus, entersState, getVoiceConnection } from '@discordjs/voice';
import Command from "../../structures/Command.js";
import { KaraokeQueue, KaraokeSettings } from "../../schemas/karaoke.js";
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const emoji = require("../../data/emoji.json");

export default class StartQueue extends Command {
    constructor(client) {
        super(client, {
            name: 'startqueue',
            description: {
                content: 'Start karaoke session and send a live queue with controls',
                usage: '',
                examples: ['startqueue'],
            },
            aliases: ['qstart', 'beginqueue'],
            category: 'karaoke',
            cooldown: 5,
            permissions: {
                dev: false,
                client: ['SendMessages', 'ViewChannel', 'EmbedLinks', 'MuteMembers', 'Connect'],
                user: [],
            },
            slashCommand: false // Prefix command only
        });
    }

    async run(ctx, args) {
        // Check karaoke configuration
        const settings = await KaraokeSettings.findOne({ guildId: ctx.guild.id }).catch(() => null);
        if (!settings?.isConfigured) {
            return ctx.sendMessage(`${emoji.status.error} Karaoke system is not configured! Use \`/karaoke-setup wizard\` to set it up.`);
        }

        // Check for Event Manager permission
        const isEventManager = settings.eventManagerRoleId && ctx.member.roles.cache.has(settings.eventManagerRoleId);
        const isAdmin = ctx.member.permissions.has('ManageChannels');
        
        if (!isEventManager && !isAdmin) {
            return ctx.sendMessage(`${emoji.status.error} Only Event Managers can start karaoke sessions.`);
        }

        // Check if session already exists
        const existingSession = await KaraokeQueue.findOne({ 
            guildId: ctx.guild.id, 
            isActive: true 
        }).catch(() => null);

        if (existingSession) {
            return ctx.sendMessage(`${emoji.status.error} A karaoke session is already active! Use \`.nextqueue\` to manage it or \`/karaoke stop\` to end it.`);
        }

        // Validate channels exist
        const textChannel = await ctx.guild.channels.fetch(settings.karaokeChannelId).catch(() => null);
        const voiceChannel = await ctx.guild.channels.fetch(settings.voiceChannelId).catch(() => null);

        if (!textChannel || !voiceChannel) {
            return ctx.sendMessage(`${emoji.status.error} Configured channels not found. Please run \`/karaoke-setup wizard\` again.`);
        }

        // Join voice channel
        let connection = null;
        try {
            connection = joinVoiceChannel({
                channelId: settings.voiceChannelId,
                guildId: ctx.guild.id,
                adapterCreator: ctx.guild.voiceAdapterCreator,
                selfDeaf: false,
                selfMute: true
            });

            await entersState(connection, VoiceConnectionStatus.Ready, 15000);
        } catch (error) {
            console.error('Failed to join voice:', error);
            return ctx.sendMessage(`${emoji.status.error} Failed to join voice channel: ${error.message}`);
        }

        // Auto-mute all members in voice channel (except Event Managers)
        if (settings.autoMuteEnabled) {
            try {
                const members = voiceChannel.members;
                for (const [, member] of members) {
                    const isMemberEventManager = settings.eventManagerRoleId && member.roles.cache.has(settings.eventManagerRoleId);
                    if (!isMemberEventManager && !member.user.bot) {
                        await member.voice.setMute(true, 'Karaoke: Auto-mute audience').catch(() => {});
                    }
                }
            } catch (error) {
                console.error('Auto-mute error:', error);
            }
        }

        // Create karaoke session
        const session = new KaraokeQueue({
            guildId: ctx.guild.id,
            channelId: settings.karaokeChannelId,
            voiceChannelId: settings.voiceChannelId,
            isActive: true,
            isLocked: false,
            queue: [],
            currentSinger: null,
            settings: {
                maxQueuePerUser: 2,
                autoMuteAudience: settings.autoMuteEnabled,
                allowRatings: true
            }
        });

        await session.save().catch(() => {});

        // Build live queue message with controls
        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('karaoke_join')
                .setLabel('Join Queue')
                .setStyle(ButtonStyle.Success)
                .setEmoji('➕'),
            new ButtonBuilder()
                .setCustomId('songs_list')
                .setLabel('Browse Songs')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📖'),
            new ButtonBuilder()
                .setCustomId('karaoke_queue')
                .setLabel('View Queue')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('📋')
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('karaoke_next')
                .setLabel('Next Singer')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('⏭️'),
            new ButtonBuilder()
                .setCustomId('queue_full')
                .setLabel('Full Queue')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('📋')
        );

        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${emoji.karaoke.microphone} Karaoke Session Started!`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `${emoji.karaoke.party} **Welcome to Karaoke Night!**\n\n` +
                `${emoji.karaoke.tv} **Channel:** <#${settings.karaokeChannelId}>\n` +
                `${emoji.karaoke.speaker} **Voice:** <#${settings.voiceChannelId}>\n` +
                `${emoji.karaoke.crown} **Event Manager:** <@&${settings.eventManagerRoleId}>\n\n` +
                `${emoji.misc.divider}\n\n` +
                `**${emoji.karaoke.queue} How to Join:**\n` +
                `1. Click "Browse Songs" or use \`/songs\`\n` +
                `2. Use \`.joinqueue <song>\` or click "Join Queue"\n` +
                `3. Join the voice channel and wait for your turn\n` +
                `4. You'll be unmuted when it's your time to sing!\n\n` +
                `**${emoji.karaoke.mute} Auto-Mute:** ${settings.autoMuteEnabled ? 'Enabled - Audience is muted' : 'Disabled'}\n` +
                `**${emoji.karaoke.queue} Queue Status:** Empty - Be the first to join!\n\n` +
                `*Good luck and have fun! ${emoji.karaoke.microphone}*`
            ))
            .addActionRowComponents(row1)
            .addActionRowComponents(row2);

        return ctx.sendMessage({ components: [container] });
    }
}
