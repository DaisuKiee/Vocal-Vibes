import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, ChannelSelectMenuBuilder, RoleSelectMenuBuilder, ChannelType } from 'discord.js';
import Command from "../../structures/Command.js";
import { KaraokeSettings } from "../../schemas/karaoke.js";
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const emoji = require("../../data/emoji.json");

export default class Setup extends Command {
    constructor(client) {
        super(client, {
            name: 'karaoke-setup',
            description: {
                content: 'View or configure karaoke system for this server',
                usage: '',
                examples: ['karaoke-setup view', 'karaoke-setup wizard'],
            },
            aliases: ['ksetup', 'karaokesetup'],
            category: 'karaoke',
            cooldown: 5,
            permissions: {
                dev: false,
                client: ['SendMessages', 'ViewChannel', 'EmbedLinks'],
                user: [], // No permission required - checked per subcommand
            },
            slashCommand: true,
            options: [
                {
                    name: 'wizard',
                    description: 'Start the guided setup wizard (Admin only)',
                    type: 1
                },
                {
                    name: 'view',
                    description: 'View current karaoke settings',
                    type: 1
                },
                {
                    name: 'reset',
                    description: 'Reset all karaoke settings (Admin only)',
                    type: 1
                }
            ]
        });
    }

    async run(ctx, args) {
        const subcommand = ctx.isInteraction ? ctx.interaction.options.getSubcommand() : args[0]?.toLowerCase();

        switch (subcommand) {
            case 'wizard':
                return this.startWizard(ctx);
            case 'view':
                return this.viewSettings(ctx);
            case 'reset':
                return this.resetSettings(ctx);
            default:
                return this.viewSettings(ctx); // Default to view (no permission needed)
        }
    }

    async startWizard(ctx) {
        // Check for Manage Server permission
        if (!ctx.member.permissions.has('ManageGuild')) {
            return ctx.sendMessage({
                content: `${emoji.status.error} You need \`Manage Server\` permission to configure karaoke settings.`,
                flags: 64
            });
        }

        const settings = await KaraokeSettings.findOne({ guildId: ctx.guild.id }).catch(() => null);

        // Step 1: Welcome & Text Channel Selection
        const channelSelect = new ChannelSelectMenuBuilder()
            .setCustomId('setup_text_channel')
            .setPlaceholder('📺 Select the karaoke text channel')
            .setChannelTypes(ChannelType.GuildText);

        const channelRow = new ActionRowBuilder().addComponents(channelSelect);

        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('# 🎤 Karaoke Setup'))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `**Welcome to Karaoke Setup!**\n\n` +
                `Before you can use the karaoke system, we need to configure a few things:\n\n` +
                `**Step 1 of 3:** Select the text channel for karaoke\n` +
                `This is where the queue, song list, and announcements will appear.\n\n` +
                `───────────────────\n\n` +
                `**📋 How Karaoke Works:**\n` +
                `1. Event Manager starts a karaoke session\n` +
                `2. Audience joins the voice/stage channel (auto-muted)\n` +
                `3. Users browse songs and join the queue\n` +
                `4. When it's their turn, they get unmuted to sing\n` +
                `5. After singing, they're muted again\n` +
                `6. Audience can rate performances!\n\n` +
                `💡 **Tip:** Stage channels work great for karaoke!\n\n` +
                `*Select a text channel below to continue...*`
            ))
            .addActionRowComponents(channelRow);

        return ctx.sendMessage({ components: [container], flags: 32768 });
    }

    async viewSettings(ctx) {
        const settings = await KaraokeSettings.findOne({ guildId: ctx.guild.id }).catch(() => null);
        const isAdmin = ctx.member.permissions.has('ManageGuild');

        if (!settings || !settings.isConfigured) {
            // Not configured - show different view for admins vs non-admins
            if (isAdmin) {
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('setup_start_wizard')
                        .setLabel('🚀 Start Setup')
                        .setStyle(ButtonStyle.Success)
                );

                const container = new ContainerBuilder()
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent('# ⚠️ Karaoke Not Configured'))
                    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                        `The karaoke system hasn't been set up yet!\n\n` +
                        `Click the button below to start the setup wizard.`
                    ))
                    .addActionRowComponents(row);

                return ctx.sendMessage({ components: [container], flags: 32768 });
            } else {
                // Non-admin view - no buttons
                const container = new ContainerBuilder()
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent('# ⚠️ Karaoke Not Configured'))
                    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                        `The karaoke system hasn't been set up yet!\n\n` +
                        `*Ask a server administrator to configure karaoke settings using \`/karaoke-setup wizard\`*\n\n` +
                        `🔒 **View Only** - You don't have permission to modify settings.`
                    ));

                return ctx.sendMessage({ components: [container], flags: 32768 });
            }
        }

        const textChannel = settings.karaokeChannelId ? `<#${settings.karaokeChannelId}>` : 'Not set';
        const voiceChannel = settings.voiceChannelId ? `<#${settings.voiceChannelId}>` : 'Not set';
        const eventManager = settings.eventManagerRoleId ? `<@&${settings.eventManagerRoleId}>` : 'Not set';
        
        // Command mode display
        const commandMode = settings.commandMode || 'automatic';
        const commandModeDisplay = commandMode === 'automatic' ? 'Slash Commands (/)' : 'Prefix Commands';
        
        // Sticky mode display
        const stickyMode = settings.stickyMode || 'sticky';
        const stickyDelay = settings.stickyDelay || 30;
        let stickyDisplay = '';
        if (!settings.stickyEnabled) {
            stickyDisplay = 'Disabled';
        } else if (stickyMode === 'sticky') {
            stickyDisplay = 'Sticky (always on top)';
        } else {
            stickyDisplay = `Delay (${stickyDelay}s)`;
        }

        // Build container based on admin status
        if (isAdmin) {
            // Admin view - with buttons
            const row1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('setup_start_wizard')
                    .setLabel('🔄 Reconfigure')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`setup_automute_${!settings.autoMuteEnabled}`)
                    .setLabel(`Auto-Mute: ${settings.autoMuteEnabled ? 'ON' : 'OFF'}`)
                    .setStyle(settings.autoMuteEnabled ? ButtonStyle.Success : ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('setup_reset')
                    .setLabel('🗑️ Reset')
                    .setStyle(ButtonStyle.Danger)
            );

            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('setup_command_mode')
                    .setLabel(`⚙️ Mode: ${commandMode === 'automatic' ? 'Slash' : 'Prefix'}`)
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('setup_sticky_toggle')
                    .setLabel(`📌 Sticky: ${settings.stickyEnabled ? 'ON' : 'OFF'}`)
                    .setStyle(settings.stickyEnabled ? ButtonStyle.Success : ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('setup_sticky_mode')
                    .setLabel(`Mode: ${stickyMode === 'sticky' ? 'Sticky' : 'Delay'}`)
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(!settings.stickyEnabled),
                new ButtonBuilder()
                    .setCustomId('setup_sticky_delay')
                    .setLabel(`⏱️ Delay`)
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(!settings.stickyEnabled || stickyMode !== 'delay')
            );

            const container = new ContainerBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent('# ⚙️ Karaoke Configuration'))
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `**Status:** ✅ Configured\n\n` +
                    `**📺 Text Channel:** ${textChannel}\n` +
                    `**🔊 Voice Channel:** ${voiceChannel}\n` +
                    `**👑 Event Manager Role:** ${eventManager}\n` +
                    `**⚙️ Command Mode:** ${commandModeDisplay}\n` +
                    `**🔇 Auto-Mute Audience:** ${settings.autoMuteEnabled ? 'Yes' : 'No'}\n` +
                    `**📌 Sticky Messages:** ${stickyDisplay}\n\n` +
                    `───────────────────\n\n` +
                    `**📋 Quick Guide:**\n` +
                    `• Use \`/karaoke start\` to begin a session\n` +
                    `• Audience joining VC will be auto-muted\n` +
                    `• Singers get unmuted when it's their turn\n` +
                    `• Use \`/karaoke stop\` to end the session`
                ))
                .addActionRowComponents(row1)
                .addActionRowComponents(row2);

            return ctx.sendMessage({ components: [container], flags: 32768 });
        } else {
            // Non-admin view - no buttons, just info
            const container = new ContainerBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent('# ⚙️ Karaoke Configuration'))
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `**Status:** ✅ Configured\n\n` +
                    `**📺 Text Channel:** ${textChannel}\n` +
                    `**🔊 Voice Channel:** ${voiceChannel}\n` +
                    `**👑 Event Manager Role:** ${eventManager}\n` +
                    `**⚙️ Command Mode:** ${commandModeDisplay}\n` +
                    `**🔇 Auto-Mute Audience:** ${settings.autoMuteEnabled ? 'Yes' : 'No'}\n` +
                    `**📌 Sticky Messages:** ${stickyDisplay}\n\n` +
                    `───────────────────\n\n` +
                    `**📋 Quick Guide:**\n` +
                    `• Use \`/karaoke start\` to begin a session\n` +
                    `• Audience joining VC will be auto-muted\n` +
                    `• Singers get unmuted when it's their turn\n` +
                    `• Use \`/karaoke stop\` to end the session\n\n` +
                    `───────────────────\n\n` +
                    `🔒 **View Only** - You don't have permission to modify settings.`
                ));

            return ctx.sendMessage({ components: [container], flags: 32768 });
        }
    }

    async resetSettings(ctx) {
        // Check for Manage Server permission
        if (!ctx.member.permissions.has('ManageGuild')) {
            return ctx.sendMessage({
                content: `${emoji.status.error} You need \`Manage Server\` permission to reset karaoke settings.`,
                flags: 64
            });
        }

        await KaraokeSettings.findOneAndDelete({ guildId: ctx.guild.id }).catch(() => {});

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('setup_start_wizard')
                .setLabel('🚀 Setup Again')
                .setStyle(ButtonStyle.Success)
        );

        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('# 🗑️ Settings Reset'))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `All karaoke settings have been reset.\n\n` +
                `You'll need to run the setup wizard again before using karaoke.`
            ))
            .addActionRowComponents(row);

        return ctx.sendMessage({ components: [container], flags: 32768 });
    }
}
