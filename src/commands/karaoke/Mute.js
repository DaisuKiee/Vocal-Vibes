import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder } from 'discord.js';
import Command from "../../structures/Command.js";
import { KaraokeQueue, KaraokeSettings } from "../../schemas/karaoke.js";
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const emoji = require("../../data/emoji.json");

export default class Mute extends Command {
    constructor(client) {
        super(client, {
            name: 'mute',
            description: {
                content: 'Manage audience muting during karaoke performances',
                usage: '<audience|user|unmute>',
                examples: ['mute audience', 'mute user @user', 'mute unmute'],
            },
            aliases: ['audiomute', 'silence'],
            category: 'karaoke',
            cooldown: 5,
            permissions: {
                dev: false,
                client: ['SendMessages', 'ViewChannel', 'EmbedLinks', 'MuteMembers', 'ManageChannels'],
                user: [],
            },
            slashCommand: true,
            options: [
                {
                    name: 'audience',
                    description: 'Mute/unmute all audience members (except current singer)',
                    type: 1,
                    options: [
                        {
                            name: 'action',
                            description: 'Mute or unmute the audience',
                            type: 3,
                            required: true,
                            choices: [
                                { name: 'Mute All', value: 'mute' },
                                { name: 'Unmute All', value: 'unmute' }
                            ]
                        }
                    ]
                },
                {
                    name: 'user',
                    description: 'Mute/unmute a specific user',
                    type: 1,
                    options: [
                        {
                            name: 'target',
                            description: 'User to mute/unmute',
                            type: 6,
                            required: true
                        },
                        {
                            name: 'action',
                            description: 'Mute or unmute',
                            type: 3,
                            required: true,
                            choices: [
                                { name: 'Mute', value: 'mute' },
                                { name: 'Unmute', value: 'unmute' }
                            ]
                        }
                    ]
                },
                {
                    name: 'auto',
                    description: 'Toggle automatic audience muting when someone sings',
                    type: 1,
                    options: [
                        {
                            name: 'enabled',
                            description: 'Enable or disable auto-mute',
                            type: 5,
                            required: true
                        }
                    ]
                },
                {
                    name: 'status',
                    description: 'View current mute settings',
                    type: 1
                }
            ]
        });
    }

    async checkEventManagerPermission(ctx) {
        const settings = await KaraokeSettings.findOne({ guildId: ctx.guild.id }).catch(() => null);
        if (!settings) return ctx.member.permissions.has('Administrator');
        
        if (settings.eventManagerRoleId) {
            const hasRole = ctx.member.roles.cache.has(settings.eventManagerRoleId);
            const isAdmin = ctx.member.permissions.has('Administrator');
            return hasRole || isAdmin;
        }
        
        return ctx.member.permissions.has('ManageChannels');
    }

    async run(ctx, args) {
        // Check Event Manager permission
        const canAccess = await this.checkEventManagerPermission(ctx);
        if (!canAccess) {
            const settings = await KaraokeSettings.findOne({ guildId: ctx.guild.id }).catch(() => null);
            return ctx.sendMessage({
                content: `${emoji.status.error} You need the Event Manager role to use mute commands!${settings?.eventManagerRoleId ? ` (<@&${settings.eventManagerRoleId}>)` : ''}`,
                flags: 64
            });
        }

        const subcommand = ctx.isInteraction ? ctx.interaction.options.getSubcommand() : args[0]?.toLowerCase();

        switch (subcommand) {
            case 'audience':
                return this.muteAudience(ctx, args);
            case 'user':
                return this.muteUser(ctx, args);
            case 'auto':
                return this.toggleAutoMute(ctx, args);
            case 'status':
                return this.showStatus(ctx);
            default:
                return this.showStatus(ctx);
        }
    }

    async muteAudience(ctx, args) {
        const session = await KaraokeQueue.findOne({ 
            guildId: ctx.guild.id, 
            isActive: true 
        }).catch(() => null);

        if (!session || !session.voiceChannelId) {
            return ctx.sendMessage({ content: '❌ No active karaoke session with a voice channel.', flags: 64 });
        }

        const action = ctx.isInteraction 
            ? ctx.interaction.options.getString('action') 
            : args[1]?.toLowerCase();

        const voiceChannel = await ctx.guild.channels.fetch(session.voiceChannelId).catch(() => null);
        if (!voiceChannel) {
            return ctx.sendMessage({ content: '❌ Voice channel not found.', flags: 64 });
        }

        const shouldMute = action === 'mute';
        const currentSingerId = session.currentSinger?.userId;
        
        let mutedCount = 0;
        let failedCount = 0;

        for (const [memberId, member] of voiceChannel.members) {
            if (memberId === currentSingerId || member.user.bot) continue;
            
            try {
                await member.voice.setMute(shouldMute, `Karaoke ${shouldMute ? 'mute' : 'unmute'} by ${ctx.author.tag}`);
                mutedCount++;
            } catch (error) {
                failedCount++;
            }
        }

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('mute_audience_mute')
                .setLabel('Mute All')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🔇')
                .setDisabled(shouldMute),
            new ButtonBuilder()
                .setCustomId('mute_audience_unmute')
                .setLabel('Unmute All')
                .setStyle(ButtonStyle.Success)
                .setEmoji('🔊')
                .setDisabled(!shouldMute)
        );

        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${shouldMute ? '🔇' : '🔊'} Audience ${shouldMute ? 'Muted' : 'Unmuted'}`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `${shouldMute ? '🔇' : '🔊'} **${mutedCount}** members ${shouldMute ? 'muted' : 'unmuted'}\n` +
                `${failedCount > 0 ? `⚠️ **${failedCount}** failed (missing permissions)\n` : ''}` +
                `${currentSingerId ? `🎤 Current singer <@${currentSingerId}> excluded` : ''}`
            ))
            .addActionRowComponents(row);

        return ctx.sendMessage({ components: [container], flags: 32768 });
    }

    async muteUser(ctx, args) {
        const session = await KaraokeQueue.findOne({ 
            guildId: ctx.guild.id, 
            isActive: true 
        }).catch(() => null);

        if (!session || !session.voiceChannelId) {
            return ctx.sendMessage({ content: '❌ No active karaoke session with a voice channel.', flags: 64 });
        }

        const targetUser = ctx.isInteraction 
            ? ctx.interaction.options.getUser('target')
            : ctx.message.mentions.users.first();
        const action = ctx.isInteraction 
            ? ctx.interaction.options.getString('action') 
            : args[2]?.toLowerCase() || 'mute';

        if (!targetUser) {
            return ctx.sendMessage({ content: '❌ Please specify a user to mute/unmute.', flags: 64 });
        }

        const member = await ctx.guild.members.fetch(targetUser.id).catch(() => null);
        if (!member) {
            return ctx.sendMessage({ content: '❌ User not found in this server.', flags: 64 });
        }

        if (!member.voice.channel) {
            return ctx.sendMessage({ content: '❌ User is not in a voice channel.', flags: 64 });
        }

        const shouldMute = action === 'mute';

        try {
            await member.voice.setMute(shouldMute, `Karaoke ${shouldMute ? 'mute' : 'unmute'} by ${ctx.author.tag}`);
        } catch (error) {
            return ctx.sendMessage({ content: `❌ Failed to ${shouldMute ? 'mute' : 'unmute'} user. Check bot permissions.`, flags: 64 });
        }

        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${shouldMute ? '🔇' : '🔊'} User ${shouldMute ? 'Muted' : 'Unmuted'}`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `${shouldMute ? '🔇' : '🔊'} <@${targetUser.id}> has been ${shouldMute ? 'muted' : 'unmuted'}.`
            ));

        return ctx.sendMessage({ components: [container], flags: 32768 });
    }

    async toggleAutoMute(ctx, args) {
        const session = await KaraokeQueue.findOne({ 
            guildId: ctx.guild.id, 
            isActive: true 
        }).catch(() => null);

        if (!session) {
            return ctx.sendMessage({ content: '❌ No active karaoke session.', flags: 64 });
        }

        const enabled = ctx.isInteraction 
            ? ctx.interaction.options.getBoolean('enabled')
            : args[1]?.toLowerCase() === 'on' || args[1]?.toLowerCase() === 'true';

        session.settings.autoMuteAudience = enabled;
        await session.save().catch(() => {});

        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('# ⚙️ Auto-Mute Settings'))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `Auto-mute audience: **${enabled ? 'Enabled ✅' : 'Disabled ❌'}**\n\n` +
                `${enabled 
                    ? 'Audience will be automatically muted when a singer starts performing.'
                    : 'Audience will not be automatically muted.'}`
            ));

        return ctx.sendMessage({ components: [container], flags: 32768 });
    }

    async showStatus(ctx) {
        const session = await KaraokeQueue.findOne({ 
            guildId: ctx.guild.id, 
            isActive: true 
        }).catch(() => null);

        if (!session) {
            return ctx.sendMessage({ content: '❌ No active karaoke session.', flags: 64 });
        }

        let voiceInfo = 'No voice channel set';
        let mutedCount = 0;
        let totalMembers = 0;

        if (session.voiceChannelId) {
            const voiceChannel = await ctx.guild.channels.fetch(session.voiceChannelId).catch(() => null);
            if (voiceChannel) {
                totalMembers = voiceChannel.members.filter(m => !m.user.bot).size;
                mutedCount = voiceChannel.members.filter(m => !m.user.bot && m.voice.serverMute).size;
                voiceInfo = `<#${session.voiceChannelId}>`;
            }
        }

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('mute_audience_mute')
                .setLabel('Mute All')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🔇'),
            new ButtonBuilder()
                .setCustomId('mute_audience_unmute')
                .setLabel('Unmute All')
                .setStyle(ButtonStyle.Success)
                .setEmoji('🔊'),
            new ButtonBuilder()
                .setCustomId(`mute_auto_${!session.settings.autoMuteAudience}`)
                .setLabel(`Auto-Mute: ${session.settings.autoMuteAudience ? 'ON' : 'OFF'}`)
                .setStyle(session.settings.autoMuteAudience ? ButtonStyle.Primary : ButtonStyle.Secondary)
                .setEmoji('⚙️')
        );

        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('# 🔊 Mute Status'))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `**Voice Channel:** ${voiceInfo}\n` +
                `**Members:** ${totalMembers} total\n` +
                `**Muted:** ${mutedCount} members\n` +
                `**Auto-Mute:** ${session.settings.autoMuteAudience ? 'Enabled ✅' : 'Disabled ❌'}`
            ))
            .addActionRowComponents(row);

        return ctx.sendMessage({ components: [container], flags: 32768 });
    }
}
