import Event from "../../structures/Event.js";
import Context from "../../structures/Context.js";
import { InteractionType, Collection, PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ActionRowBuilder, ChannelSelectMenuBuilder, RoleSelectMenuBuilder, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import { KaraokeQueue, Song, Rating, KaraokeSettings } from "../../schemas/karaoke.js";
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const emoji = require("../../data/emoji.json");

export default class InteractionCreate extends Event {
    constructor(...args) {
        super(...args, {
            name: 'interactionCreate'
        });
    }

    async run(interaction) {
        if (interaction.isButton()) {
            return this.handleButton(interaction);
        }

        if (interaction.isStringSelectMenu() || interaction.isChannelSelectMenu() || interaction.isRoleSelectMenu()) {
            return this.handleSelectMenu(interaction);
        }

        if (interaction.isModalSubmit()) {
            return this.handleModalSubmit(interaction);
        }

        if (interaction.type === InteractionType.ApplicationCommandAutocomplete) {
            return this.handleAutocomplete(interaction);
        }

        if (interaction.type === InteractionType.ApplicationCommand) {
            const { commandName } = interaction;
            if (!commandName) return;
            
            const cmd = this.client.commands.get(interaction.commandName);
            if (!cmd || !cmd.slashCommand) return;
            
            const ctx = new Context(interaction, interaction.options.data);
            this.client.logger.cmd('%s used by %s from %s', cmd.name, ctx.author.id, ctx.guild?.id || 'DM');
            
            // Log command to Discord channel
            if (this.client.discordLogger) {
                const args = interaction.options.data.map(opt => `${opt.name}:${opt.value}`);
                this.client.discordLogger.logCommand(ctx, cmd.name, args);
            }
            
            // Permission checks
            if (!interaction.inGuild()) return;
            if (!interaction.channel.permissionsFor(interaction.guild.members.me).has(PermissionFlagsBits.ViewChannel)) {
                return interaction.reply({ content: 'I cannot see this channel!', flags: 64 }).catch(() => {});
            }

            if (cmd.permissions?.client && !interaction.guild.members.me.permissions.has(cmd.permissions.client)) {
                return interaction.reply({ content: 'I don\'t have enough permissions.', flags: 64 }).catch(() => {});
            }

            if (cmd.permissions?.user && !interaction.member.permissions.has(cmd.permissions.user)) {
                return interaction.reply({ content: 'You don\'t have enough permissions.', flags: 64 }).catch(() => {});
            }

            if (cmd.permissions?.dev) {
                const isDev = this.client.config.ownerID?.includes(interaction.user.id);
                if (!isDev) return interaction.reply({ content: 'This command is only for developers.', flags: 64 }).catch(() => {});
            }

            // Cooldown
            if (!this.client.cooldowns.has(commandName)) {
                this.client.cooldowns.set(commandName, new Collection());
            }
            const timestamps = this.client.cooldowns.get(commandName);
            const cooldownAmount = (cmd.cooldown || 3) * 1000;
            
            if (timestamps.has(interaction.user.id)) {
                const expirationTime = timestamps.get(interaction.user.id) + cooldownAmount;
                if (Date.now() < expirationTime) {
                    const timeLeft = (expirationTime - Date.now()) / 1000;
                    return interaction.reply({ content: `Please wait ${timeLeft.toFixed(1)}s`, flags: 64 });
                }
            }
            timestamps.set(interaction.user.id, Date.now());
            setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);

            // Check if karaoke is configured (except for setup command)
            if (cmd.category === 'karaoke' && cmd.name !== 'karaoke-setup' && cmd.name !== 'seed-songs') {
                const settings = await KaraokeSettings.findOne({ guildId: interaction.guild.id }).catch(() => null);
                if (!settings?.isConfigured) {
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('setup_start_wizard')
                            .setLabel(`${emoji.actions.setup} Setup Karaoke`)
                            .setStyle(ButtonStyle.Success)
                    );
                    const container = new ContainerBuilder()
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${emoji.status.warning} Setup Required`))
                        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                            'The karaoke system needs to be configured first!\n\n' +
                            'An admin needs to run `/karaoke-setup` to set up:\n' +
                            '• Text channel for karaoke\n' +
                            '• Voice channel for singing\n' +
                            '• Event manager role\n\n' +
                            '*Click below or use `/karaoke-setup wizard`*'
                        ))
                        .addActionRowComponents(row);
                    return interaction.reply({ components: [container], flags: 32768 | 64 });
                }
            }
            
            try {
                return await cmd.run(ctx, ctx.args);
            } catch (error) {
                console.error(error);
                
                // Log error to Discord channel
                if (this.client.discordLogger) {
                    this.client.discordLogger.logError(error, {
                        command: cmd.name,
                        user: interaction.user,
                        guild: interaction.guild
                    });
                }
                
                await interaction.reply({ content: 'An error occurred.', flags: 64 }).catch(() => {});
            }
        }
    }

    async handleButton(interaction) {
        const customId = interaction.customId;

        try {
            // ===== SETUP WIZARD BUTTONS =====
            if (customId === 'setup_start_wizard') {
                if (!interaction.member.permissions.has('ManageGuild')) {
                    return interaction.reply({ content: `${emoji.status.error} You need \`Manage Server\` permission.`, flags: 64 });
                }
                const cmd = this.client.commands.get('karaoke-setup');
                if (cmd) {
                    const ctx = new Context(interaction, []);
                    interaction.options = { getSubcommand: () => 'wizard' };
                    return cmd.run(ctx, ['wizard']);
                }
            }

            if (customId === 'setup_confirm') {
                if (!interaction.member.permissions.has('ManageGuild')) {
                    return interaction.reply({ content: `${emoji.status.error} You need \`Manage Server\` permission.`, flags: 64 });
                }
                
                const settings = await KaraokeSettings.findOne({ guildId: interaction.guild.id }).catch(() => null);
                if (!settings?.karaokeChannelId || !settings?.voiceChannelId || !settings?.eventManagerRoleId) {
                    return interaction.reply({ content: `${emoji.status.error} Please complete all setup steps first.`, flags: 64 });
                }

                // Join the voice channel
                let voiceConnected = false;
                try {
                    const { joinVoiceChannel, VoiceConnectionStatus, entersState } = await import('@discordjs/voice');
                    const voiceChannel = await interaction.guild.channels.fetch(settings.voiceChannelId);
                    
                    if (voiceChannel) {
                        const connection = joinVoiceChannel({
                            channelId: settings.voiceChannelId,
                            guildId: interaction.guild.id,
                            adapterCreator: interaction.guild.voiceAdapterCreator,
                            selfDeaf: false,
                            selfMute: true
                        });
                        await entersState(connection, VoiceConnectionStatus.Ready, 10000);
                        voiceConnected = true;
                    }
                } catch (e) {
                    console.error('Failed to join voice during setup:', e.message);
                }

                settings.isConfigured = true;
                settings.autoMuteEnabled = true;
                await settings.save().catch(() => {});

                const container = new ContainerBuilder()
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${emoji.status.success} Karaoke Setup Complete!`))
                    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                        '**Your karaoke system is ready!**\n\n' +
                        `${emoji.karaoke.tv} **Text Channel:** <#${settings.karaokeChannelId}>\n` +
                        `${emoji.karaoke.speaker} **Voice Channel:** <#${settings.voiceChannelId}> ${voiceConnected ? `${emoji.status.success} Connected` : ''}\n` +
                        `${emoji.karaoke.crown} **Event Manager:** <@&${settings.eventManagerRoleId}>\n` +
                        `${emoji.karaoke.mute} **Auto-Mute:** Enabled\n\n` +
                        `${emoji.misc.divider}\n\n` +
                        `**${emoji.karaoke.queue} How to Start:**\n` +
                        '1. Event Manager uses `/karaoke start`\n' +
                        '2. Audience joins the voice channel (auto-muted)\n' +
                        '3. Users browse `/songs` and join the queue\n' +
                        '4. Current singer gets unmuted automatically\n' +
                        '5. Use `/karaoke stop` to end the session\n\n' +
                        `*Have fun singing! ${emoji.karaoke.microphone}*`
                    ));

                return interaction.update({ components: [container], flags: 32768 });
            }

            if (customId.startsWith('setup_automute_')) {
                if (!interaction.member.permissions.has('ManageGuild')) {
                    return interaction.reply({ content: `${emoji.status.error} You need \`Manage Server\` permission.`, flags: 64 });
                }
                const enabled = customId.endsWith('true');
                await KaraokeSettings.findOneAndUpdate(
                    { guildId: interaction.guild.id },
                    { autoMuteEnabled: enabled },
                    { upsert: true }
                ).catch(() => {});
                
                // Refresh the settings container
                return this.refreshSettingsContainer(interaction);
            }

            // Command mode toggle button
            if (customId === 'setup_command_mode') {
                if (!interaction.member.permissions.has('ManageGuild')) {
                    return interaction.reply({ content: `${emoji.status.error} You need \`Manage Server\` permission.`, flags: 64 });
                }
                const settings = await KaraokeSettings.findOne({ guildId: interaction.guild.id }).catch(() => null);
                const currentMode = settings?.commandMode || 'automatic';
                const newMode = currentMode === 'automatic' ? 'manual' : 'automatic';
                await KaraokeSettings.findOneAndUpdate(
                    { guildId: interaction.guild.id },
                    { commandMode: newMode },
                    { upsert: true }
                ).catch(() => {});
                
                // Refresh the settings container
                return this.refreshSettingsContainer(interaction);
            }

            // ===== STICKY MESSAGE BUTTONS =====
            if (customId === 'setup_sticky_toggle') {
                if (!interaction.member.permissions.has('ManageGuild')) {
                    return interaction.reply({ content: `${emoji.status.error} You need \`Manage Server\` permission.`, flags: 64 });
                }
                const settings = await KaraokeSettings.findOne({ guildId: interaction.guild.id }).catch(() => null);
                const newValue = !settings?.stickyEnabled;
                await KaraokeSettings.findOneAndUpdate(
                    { guildId: interaction.guild.id },
                    { stickyEnabled: newValue },
                    { upsert: true }
                ).catch(() => {});
                
                // Refresh the settings container
                return this.refreshSettingsContainer(interaction);
            }

            if (customId === 'setup_sticky_mode') {
                if (!interaction.member.permissions.has('ManageGuild')) {
                    return interaction.reply({ content: `${emoji.status.error} You need \`Manage Server\` permission.`, flags: 64 });
                }
                const settings = await KaraokeSettings.findOne({ guildId: interaction.guild.id }).catch(() => null);
                const currentMode = settings?.stickyMode || 'sticky';
                const newMode = currentMode === 'sticky' ? 'delay' : 'sticky';
                await KaraokeSettings.findOneAndUpdate(
                    { guildId: interaction.guild.id },
                    { stickyMode: newMode },
                    { upsert: true }
                ).catch(() => {});
                
                // Refresh the settings container
                return this.refreshSettingsContainer(interaction);
            }

            if (customId === 'setup_sticky_delay') {
                if (!interaction.member.permissions.has('ManageGuild')) {
                    return interaction.reply({ content: `${emoji.status.error} You need \`Manage Server\` permission.`, flags: 64 });
                }
                
                // Show modal to input delay
                const modal = new ModalBuilder()
                    .setCustomId('modal_sticky_delay')
                    .setTitle('⏱️ Set Sticky Message Delay');

                const delayInput = new TextInputBuilder()
                    .setCustomId('delay_seconds')
                    .setLabel('Delay in seconds (5-300)')
                    .setPlaceholder('e.g. 30')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMinLength(1)
                    .setMaxLength(3);

                modal.addComponents(new ActionRowBuilder().addComponents(delayInput));
                return interaction.showModal(modal);
            }

            // ===== COMMAND MODE SELECTION BUTTONS (WIZARD) =====
            if (customId.startsWith('setup_commandmode_')) {
                if (!interaction.member.permissions.has('ManageGuild')) {
                    return interaction.reply({ content: `${emoji.status.error} You need \`Manage Server\` permission.`, flags: 64 });
                }

                const mode = customId.replace('setup_commandmode_', ''); // 'automatic' or 'manual'
                
                await KaraokeSettings.findOneAndUpdate(
                    { guildId: interaction.guild.id },
                    { commandMode: mode },
                    { upsert: true }
                ).catch(() => {});
                
                // Get settings
                const settings = await KaraokeSettings.findOne({ guildId: interaction.guild.id }).catch(() => ({}));

                // If manual mode selected, skip sticky messages and go straight to confirmation
                if (mode === 'manual') {
                    // Set default: sticky messages disabled for manual mode
                    await KaraokeSettings.findOneAndUpdate(
                        { guildId: interaction.guild.id },
                        { stickyEnabled: false },
                        { upsert: true }
                    ).catch(() => {});
                    
                    // Go directly to confirmation
                    return this.showSetupConfirmation(interaction, settings);
                }

                // For automatic mode, continue to Step 5: Sticky Message Options
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('setup_sticky_option_sticky')
                        .setLabel('📌 Sticky (Always on top)')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('setup_sticky_option_delay')
                        .setLabel('⏱️ Delay (Resend after X seconds)')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('setup_sticky_option_disabled')
                        .setLabel('❌ Disabled')
                        .setStyle(ButtonStyle.Secondary)
                );

                const commandModeDisplay = mode === 'automatic' ? '⚡ Slash Commands (/)' : '🔧 Prefix Commands';

                const container = new ContainerBuilder()
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${emoji.karaoke.microphone} Karaoke Setup`))
                    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                        `${emoji.status.success} **Text Channel:** <#${settings?.karaokeChannelId || 'unknown'}>\n` +
                        `${emoji.status.success} **Voice Channel:** <#${settings?.voiceChannelId || 'unknown'}>\n` +
                        `${emoji.status.success} **Event Manager:** <@&${settings?.eventManagerRoleId || 'unknown'}>\n` +
                        `${emoji.status.success} **Command Mode:** ${commandModeDisplay}\n\n` +
                        `**Step 5 of 5:** Configure Sticky Messages\n\n` +
                        `**📌 Sticky Mode:**\n` +
                        `Queue message stays at the bottom of the channel.\n\n` +
                        `**⏱️ Delay Mode:**\n` +
                        `Queue message is resent after X seconds of inactivity.\n\n` +
                        `*Select an option below...*`
                    ))
                    .addActionRowComponents(row);

                return interaction.update({ components: [container], flags: 32768 });
            }

            // ===== STICKY OPTION BUTTONS (WIZARD) =====
            if (customId.startsWith('setup_sticky_option_')) {
                if (!interaction.member.permissions.has('ManageGuild')) {
                    return interaction.reply({ content: `${emoji.status.error} You need \`Manage Server\` permission.`, flags: 64 });
                }

                const option = customId.replace('setup_sticky_option_', '');
                const settings = await KaraokeSettings.findOne({ guildId: interaction.guild.id }).catch(() => ({}));

                if (option === 'disabled') {
                    await KaraokeSettings.findOneAndUpdate(
                        { guildId: interaction.guild.id },
                        { stickyEnabled: false },
                        { upsert: true }
                    ).catch(() => {});
                    
                    // Go to confirmation
                    return this.showSetupConfirmation(interaction, settings);
                }

                if (option === 'sticky') {
                    await KaraokeSettings.findOneAndUpdate(
                        { guildId: interaction.guild.id },
                        { stickyEnabled: true, stickyMode: 'sticky' },
                        { upsert: true }
                    ).catch(() => {});
                    
                    // Go to confirmation
                    return this.showSetupConfirmation(interaction, settings);
                }

                if (option === 'delay') {
                    // Show modal to input delay
                    const modal = new ModalBuilder()
                        .setCustomId('modal_setup_sticky_delay')
                        .setTitle('⏱️ Set Sticky Message Delay');

                    const delayInput = new TextInputBuilder()
                        .setCustomId('delay_seconds')
                        .setLabel('Delay in seconds (5-300)')
                        .setPlaceholder('e.g. 30')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setMinLength(1)
                        .setMaxLength(3);

                    modal.addComponents(new ActionRowBuilder().addComponents(delayInput));
                    return interaction.showModal(modal);
                }
            }

            if (customId === 'setup_reset') {
                if (!interaction.member.permissions.has('ManageGuild')) {
                    return interaction.reply({ content: `${emoji.status.error} You need \`Manage Server\` permission.`, flags: 64 });
                }
                
                // Disconnect from voice if connected
                try {
                    const { getVoiceConnection } = await import('@discordjs/voice');
                    const connection = getVoiceConnection(interaction.guild.id);
                    if (connection) connection.destroy();
                } catch (e) {}
                
                await KaraokeSettings.findOneAndDelete({ guildId: interaction.guild.id }).catch(() => {});
                return interaction.reply({ content: `${emoji.status.success} Karaoke settings reset!`, flags: 64 });
            }

            // ===== SONGBOOK BUTTONS =====
            if ((customId.startsWith('songbook_') || customId.startsWith('songbook_page_')) && !customId.includes('select') && !customId.includes('online') && !customId.includes('search') && !customId.includes('modal')) {
                const parts = customId.split('_');
                // Handle both songbook_A_1 and songbook_page_A_1
                const isPageNav = parts[1] === 'page';
                const letter = isPageNav ? parts[2] : parts[1];
                const page = parseInt(isPageNav ? parts[3] : parts[2]) || 1;
                const perPage = 10;
                
                // Handle browsing directly instead of through command
                const isNumber = letter === '#';
                let query;
                if (isNumber) {
                    query = { title: { $regex: '^[0-9]', $options: 'i' } };
                } else if (/[A-Z]/.test(letter)) {
                    query = { title: { $regex: `^${letter}`, $options: 'i' } };
                } else {
                    query = { title: { $regex: '^A', $options: 'i' } };
                }

                const totalSongs = await Song.countDocuments(query).catch(() => 0);
                const totalPages = Math.ceil(totalSongs / perPage) || 1;
                const currentPage = Math.min(Math.max(1, page), totalPages);

                const songs = await Song.find(query)
                    .sort({ title: 1 })
                    .skip((currentPage - 1) * perPage)
                    .limit(perPage)
                    .catch(() => []);

                // Build letter navigation buttons
                const letterRow1 = new ActionRowBuilder().addComponents(
                    ...['A', 'B', 'C', 'D', 'E'].map(l => 
                        new ButtonBuilder()
                            .setCustomId(`songbook_${l}_1`)
                            .setLabel(l)
                            .setStyle(l === letter ? ButtonStyle.Primary : ButtonStyle.Secondary)
                    )
                );
                
                const letterRow2 = new ActionRowBuilder().addComponents(
                    ...['F', 'G', 'H', 'I', 'J'].map(l => 
                        new ButtonBuilder()
                            .setCustomId(`songbook_${l}_1`)
                            .setLabel(l)
                            .setStyle(l === letter ? ButtonStyle.Primary : ButtonStyle.Secondary)
                    )
                );

                let content = '';
                if (songs.length === 0) {
                    content = `No songs starting with **${letter}**\n\nClick "Search Online" to find songs!`;
                } else {
                    content = songs.map((s, i) => {
                        const num = String((currentPage - 1) * perPage + i + 1).padStart(3, '0');
                        return `\`${num}\` **${s.title}**\n       *${s.artist}*`;
                    }).join('\n\n');
                    content += `\n\n${emoji.navigation.page} Page ${currentPage}/${totalPages} • ${totalSongs} songs`;
                }

                const pageRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`songbook_page_${letter}_${currentPage - 1}`)
                        .setLabel(`${emoji.navigation.prev} Prev`)
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(currentPage <= 1),
                    new ButtonBuilder()
                        .setCustomId(`songbook_page_${letter}_${currentPage + 1}`)
                        .setLabel(`Next ${emoji.navigation.next}`)
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(currentPage >= totalPages),
                    new ButtonBuilder()
                        .setCustomId('songbook_search_modal')
                        .setLabel(`🔍 Search Song`)
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('songbook_online_modal')
                        .setLabel(`🌐 Search Online`)
                        .setStyle(ButtonStyle.Primary)
                );

                const container = new ContainerBuilder()
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${emoji.karaoke.book} Songbook - ${isNumber ? '#' : letter}`))
                    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
                    .addActionRowComponents(letterRow1)
                    .addActionRowComponents(letterRow2)
                    .addActionRowComponents(pageRow);

                // Ephemeral update - only visible to user who clicked
                return interaction.update({ components: [container], flags: 32768 });
            }

            // Show modal for song search
            if (customId === 'songbook_search_modal') {
                const modal = new ModalBuilder()
                    .setCustomId('modal_song_search')
                    .setTitle('🔍 Search Songbook');

                const searchInput = new TextInputBuilder()
                    .setCustomId('search_query')
                    .setLabel('Song number, title, or artist name')
                    .setPlaceholder('e.g. 42, Bohemian Rhapsody, Queen')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(100);

                modal.addComponents(new ActionRowBuilder().addComponents(searchInput));
                return interaction.showModal(modal);
            }

            // Show modal for online search
            if (customId === 'songbook_online_modal' || customId === 'songbook_online') {
                const modal = new ModalBuilder()
                    .setCustomId('modal_online_search')
                    .setTitle('🌐 Search Online');

                const searchInput = new TextInputBuilder()
                    .setCustomId('online_query')
                    .setLabel('Song title or artist to search online')
                    .setPlaceholder('e.g. Shape of You, Ed Sheeran, etc.')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(100);

                modal.addComponents(new ActionRowBuilder().addComponents(searchInput));
                return interaction.showModal(modal);
            }

            if (customId.startsWith('online_search_')) {
                const query = decodeURIComponent(customId.replace('online_search_', ''));
                // Show modal pre-filled or just search directly
                await interaction.deferReply({ flags: 64 });
                return this.performOnlineSearch(interaction, query);
            }

            if (customId === 'songbook_select' || customId === 'karaoke_join') {
                // Show modal for typing song search
                const modal = new ModalBuilder()
                    .setCustomId('modal_song_select')
                    .setTitle('🎤 Select a Song to Sing');

                const searchInput = new TextInputBuilder()
                    .setCustomId('song_search')
                    .setLabel('Song number, title, or artist')
                    .setPlaceholder('e.g. 42, Shape of You, Ed Sheeran')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(100);

                modal.addComponents(new ActionRowBuilder().addComponents(searchInput));
                return interaction.showModal(modal);
            }

            // ===== KARAOKE SESSION BUTTONS =====
            if (customId === 'karaoke_start') {
                const cmd = this.client.commands.get('karaoke');
                if (cmd) {
                    const ctx = new Context(interaction, []);
                    interaction.options = { getSubcommand: () => 'start', getChannel: () => null };
                    return cmd.run(ctx, ['start']);
                }
            }

            if (customId === 'karaoke_songs' || customId === 'songs_list') {
                // Show songbook ephemeral to the user who clicked
                const perPage = 10;
                const letter = 'A';
                const query = { title: { $regex: '^A', $options: 'i' } };

                const totalSongs = await Song.countDocuments(query).catch(() => 0);
                const totalPages = Math.ceil(totalSongs / perPage) || 1;

                const songs = await Song.find(query)
                    .sort({ title: 1 })
                    .limit(perPage)
                    .catch(() => []);

                const letterRow1 = new ActionRowBuilder().addComponents(
                    ...['A', 'B', 'C', 'D', 'E'].map(l => 
                        new ButtonBuilder()
                            .setCustomId(`songbook_${l}_1`)
                            .setLabel(l)
                            .setStyle(l === letter ? ButtonStyle.Primary : ButtonStyle.Secondary)
                    )
                );
                
                const letterRow2 = new ActionRowBuilder().addComponents(
                    ...['F', 'G', 'H', 'I', 'J'].map(l => 
                        new ButtonBuilder()
                            .setCustomId(`songbook_${l}_1`)
                            .setLabel(l)
                            .setStyle(ButtonStyle.Secondary)
                    )
                );

                let content = '';
                if (songs.length === 0) {
                    content = `No songs starting with **A**\n\nClick "Search Online" to find songs!`;
                } else {
                    content = songs.map((s, i) => {
                        const num = String(i + 1).padStart(3, '0');
                        return `\`${num}\` **${s.title}**\n       *${s.artist}*`;
                    }).join('\n\n');
                    content += `\n\n📄 Page 1/${totalPages} • ${totalSongs} songs`;
                }

                const pageRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`songbook_page_A_0`)
                        .setLabel(`◀ Prev`)
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId(`songbook_page_A_2`)
                        .setLabel(`Next ▶`)
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(totalPages <= 1),
                    new ButtonBuilder()
                        .setCustomId('songbook_search_modal')
                        .setLabel(`🔍 Search Song`)
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('songbook_online_modal')
                        .setLabel(`🌐 Search Online`)
                        .setStyle(ButtonStyle.Primary)
                );

                const container = new ContainerBuilder()
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 📖 Songbook - A`))
                    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
                    .addActionRowComponents(letterRow1)
                    .addActionRowComponents(letterRow2)
                    .addActionRowComponents(pageRow);

                // Ephemeral - only visible to user who clicked
                return interaction.reply({ components: [container], flags: 32768 | 64 });
            }

            if (customId === 'karaoke_queue' || customId === 'queue_view' || customId === 'queue_refresh') {
                const session = await KaraokeQueue.findOne({ guildId: interaction.guild.id, isActive: true }).catch(() => null);
                
                if (!session) {
                    return interaction.reply({
                        content: `${emoji.status.error} No active karaoke session. Start one with \`/karaoke start\`!`,
                        flags: 64
                    });
                }

                // Get settings for command mode
                const settings = await KaraokeSettings.findOne({ guildId: interaction.guild.id }).catch(() => null);
                const commandMode = settings?.commandMode || 'automatic';
                const isManualMode = commandMode === 'manual';

                // Check 10-second cooldown for queue resend (per user)
                const now = new Date();
                const userCooldownKey = `queue_${interaction.user.id}`;
                if (!this.client.queueCooldowns) this.client.queueCooldowns = new Map();
                
                const userCooldown = this.client.queueCooldowns.get(userCooldownKey);
                if (userCooldown && now < new Date(userCooldown)) {
                    const remaining = Math.ceil((new Date(userCooldown) - now) / 1000);
                    return interaction.reply({ 
                        content: `${emoji.status.warning} Please wait **${remaining}s** before viewing queue again.`, 
                        flags: 64 
                    });
                }
                
                // Set 10-second cooldown for this user
                this.client.queueCooldowns.set(userCooldownKey, new Date(now.getTime() + 10000));
                setTimeout(() => this.client.queueCooldowns.delete(userCooldownKey), 10000);

                let queueContent = '';
                if (session.currentSinger?.userId) {
                    if (isManualMode) {
                        // Manual mode: Only show user
                        queueContent += `${emoji.karaoke.singing} **NOW SINGING:**\n<@${session.currentSinger.userId}>\n\n`;
                    } else {
                        // Automatic mode: Show user and song
                        queueContent += `${emoji.karaoke.singing} **NOW SINGING:**\n<@${session.currentSinger.userId}> - ${session.currentSinger.songTitle}\n\n`;
                    }
                }

                if (session.queue.length === 0) {
                    queueContent += `${emoji.karaoke.queue} **Queue is empty!**\nUse \`/queue add\` to join!`;
                } else {
                    queueContent += `${emoji.karaoke.queue} **Up Next:**\n`;
                    session.queue.slice(0, 10).forEach((q, i) => {
                        if (isManualMode) {
                            // Manual mode: Only show user
                            queueContent += `${i + 1}. <@${q.userId}>\n`;
                        } else {
                            // Automatic mode: Show user and song
                            queueContent += `${i + 1}. <@${q.userId}> - **${q.songTitle}**\n`;
                        }
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
                        .setEmoji('➕'),
                    new ButtonBuilder()
                        .setCustomId('songs_list')
                        .setLabel('Browse Songs')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('📖'),
                    new ButtonBuilder()
                        .setCustomId('queue_full')
                        .setLabel('Full Queue')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('📋'),
                    new ButtonBuilder()
                        .setCustomId('karaoke_next')
                        .setLabel('Next')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('⏭️')
                );

                const container = new ContainerBuilder()
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${emoji.karaoke.microphone} Karaoke Queue`))
                    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(queueContent))
                    .addActionRowComponents(row);

                // Ephemeral - only visible to user who clicked
                return interaction.reply({ components: [container], flags: 32768 | 64 });
            }

            // ===== VIEW LYRICS BUTTON =====
            if (customId === 'view_lyrics') {
                const session = await KaraokeQueue.findOne({ 
                    guildId: interaction.guild.id, 
                    isActive: true 
                }).catch(() => null);

                if (!session || !session.currentSinger) {
                    return interaction.reply({
                        content: `${emoji.status.error} No one is currently singing.`,
                        flags: 64
                    });
                }

                // Only the current singer can view lyrics
                if (session.currentSinger.userId !== interaction.user.id) {
                    return interaction.reply({
                        content: `${emoji.status.error} Only the current singer (<@${session.currentSinger.userId}>) can view lyrics!`,
                        flags: 64
                    });
                }

                await interaction.deferReply({ flags: 64 });

                // Fetch lyrics from Genius API
                const lyrics = await this.fetchLyricsFromGenius(
                    session.currentSinger.songTitle,
                    session.currentSinger.songId
                );

                if (!lyrics) {
                    return interaction.editReply({
                        content: `${emoji.status.error} Could not find lyrics for **${session.currentSinger.songTitle}**. Try searching online!`,
                        flags: 64
                    });
                }

                // Split lyrics into chunks if too long
                const chunks = this.splitLyrics(lyrics, 1900);
                
                for (let i = 0; i < chunks.length; i++) {
                    const content = i === 0 
                        ? `${emoji.karaoke.music} **${session.currentSinger.songTitle}**\n\n📜 **Lyrics:**\n\`\`\`\n${chunks[i]}\n\`\`\``
                        : `\`\`\`\n${chunks[i]}\n\`\`\``;
                    
                    if (i === 0) {
                        await interaction.editReply({ content, flags: 64 });
                    } else {
                        await interaction.followUp({ content, flags: 64 });
                    }
                }
                return;
            }

            if (customId === 'karaoke_next') {
                // Check for Event Manager permission
                const settings = await KaraokeSettings.findOne({ guildId: interaction.guild.id }).catch(() => null);
                const isEventManager = settings?.eventManagerRoleId && interaction.member.roles.cache.has(settings.eventManagerRoleId);
                const isAdmin = interaction.member.permissions.has('ManageChannels');
                
                if (!isEventManager && !isAdmin) {
                    return interaction.reply({ 
                        content: `${emoji.status.error} Only Event Managers can skip to the next singer.`, 
                        flags: 64 
                    });
                }

                // Direct implementation instead of calling command
                try {
                    await interaction.deferReply({ flags: 64 });
                    
                    const session = await KaraokeQueue.findOne({ 
                        guildId: interaction.guild.id, 
                        isActive: true 
                    }).catch(() => null);

                    if (!session) {
                        return interaction.editReply({ content: `${emoji.status.error} No active karaoke session.` });
                    }

                    const previousSinger = session.currentSinger;
                    
                    // Mute the previous singer
                    if (previousSinger?.userId && settings?.voiceChannelId) {
                        try {
                            const member = await interaction.guild.members.fetch(previousSinger.userId).catch(() => null);
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
                                const member = await interaction.guild.members.fetch(nextUp.userId).catch(() => null);
                                if (member?.voice?.channelId === settings.voiceChannelId) {
                                    await member.voice.setMute(false, 'Karaoke: Your turn to sing!').catch(() => {});
                                }
                            } catch (e) {}
                        }
                        
                        // AI Voice Announcement (Premium Feature)
                        try {
                            const { Premium } = await import('../../schemas/premium.js');
                            const premium = await Premium.findOne({ guildId: interaction.guild.id });
                            if (premium?.features?.aiAnnouncer) {
                                const { getVoiceConnection } = await import('@discordjs/voice');
                                const connection = getVoiceConnection(interaction.guild.id);
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

                    // Build response
                    let messageContent = '';
                    
                    if (previousSinger?.userId) {
                        messageContent += `${emoji.karaoke.party} **Thank you, <@${previousSinger.userId}>!**\n`;
                        messageContent += `${emoji.karaoke.music} *${previousSinger.songTitle}*\n\n`;
                        messageContent += `───────────────────\n\n`;
                    }
                    
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
                            .setEmoji('⏭️'),
                        new ButtonBuilder()
                            .setCustomId('karaoke_queue')
                            .setLabel('View Queue')
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji('📋')
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

                    return interaction.editReply({ components: [container], flags: 32768 });
                    
                } catch (error) {
                    console.error('karaoke_next button error:', error);
                    return interaction.editReply({ 
                        content: `${emoji.status.error} An error occurred: ${error.message}`
                    }).catch(() => {});
                }
            }

            if (customId === 'queue_full') {
                const session = await KaraokeQueue.findOne({ guildId: interaction.guild.id, isActive: true }).catch(() => null);
                if (!session) {
                    return interaction.reply({ content: `${emoji.status.error} No active karaoke session.`, flags: 64 });
                }

                // Get settings for command mode
                const settings = await KaraokeSettings.findOne({ guildId: interaction.guild.id }).catch(() => null);
                const commandMode = settings?.commandMode || 'automatic';
                const isManualMode = commandMode === 'manual';

                // Check 30-second global cooldown
                const now = new Date();
                if (session.fullQueueCooldown && now < new Date(session.fullQueueCooldown)) {
                    const remaining = Math.ceil((new Date(session.fullQueueCooldown) - now) / 1000);
                    return interaction.reply({ 
                        content: `${emoji.status.warning} Full Queue is on cooldown. Try again in **${remaining}s**.`, 
                        flags: 64 
                    });
                }

                // Set 30-second cooldown for all users
                session.fullQueueCooldown = new Date(now.getTime() + 30000);
                await session.save().catch(() => {});

                // Build full queue display
                let fullQueueContent = '';
                if (session.currentSinger?.userId) {
                    if (isManualMode) {
                        // Manual mode: Only show user
                        fullQueueContent += `${emoji.karaoke.singing} **NOW SINGING:**\n<@${session.currentSinger.userId}>\n\n`;
                    } else {
                        // Automatic mode: Show user and song
                        fullQueueContent += `${emoji.karaoke.singing} **NOW SINGING:**\n<@${session.currentSinger.userId}> - ${session.currentSinger.songTitle}\n\n`;
                    }
                }

                if (session.queue.length === 0) {
                    fullQueueContent += `${emoji.karaoke.queue} **Queue is empty!**\nUse \`/queue add\` to join!`;
                } else {
                    fullQueueContent += `${emoji.karaoke.queue} **Full Queue (${session.queue.length} singers):**\n`;
                    session.queue.forEach((q, i) => {
                        if (isManualMode) {
                            // Manual mode: Only show user
                            fullQueueContent += `${i + 1}. <@${q.userId}>\n`;
                        } else {
                            // Automatic mode: Show user and song
                            fullQueueContent += `${i + 1}. <@${q.userId}> - **${q.songTitle}**\n`;
                        }
                    });
                }

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('karaoke_join')
                        .setLabel('Join Queue')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('➕'),
                    new ButtonBuilder()
                        .setCustomId('queue_view')
                        .setLabel('Back')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('◀')
                );

                const container = new ContainerBuilder()
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${emoji.karaoke.queue} Full Karaoke Queue`))
                    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(fullQueueContent))
                    .addActionRowComponents(row);

                return interaction.update({ components: [container], flags: 32768 });
            }

            if (customId.startsWith('queue_remove_')) {
                const userId = customId.replace('queue_remove_', '');
                if (userId !== interaction.user.id) {
                    return interaction.reply({ content: `${emoji.status.error} You can only remove yourself.`, flags: 64 });
                }
                const cmd = this.client.commands.get('queue');
                if (cmd) {
                    const ctx = new Context(interaction, []);
                    interaction.options = { getSubcommand: () => 'remove' };
                    return cmd.run(ctx, ['remove']);
                }
            }

            if (customId.startsWith('queue_add_')) {
                const songId = customId.replace('queue_add_', '');
                
                try {
                    const session = await KaraokeQueue.findOne({ 
                        guildId: interaction.guild.id, 
                        isActive: true 
                    }).catch(() => null);

                    if (!session) {
                        return interaction.reply({
                            content: `${emoji.status.error} No active karaoke session. Start one with \`/karaoke start\`!`,
                            flags: 64
                        });
                    }

                    // Check if queue is locked
                    if (session.isLocked) {
                        return interaction.reply({
                            content: `${emoji.status.error} The queue is currently **locked**. Please wait for an Event Manager to unlock it.`,
                            flags: 64
                        });
                    }

                    const song = await Song.findOne({ songId }).catch(() => null);

                    if (!song) {
                        return interaction.reply({
                            content: `${emoji.status.error} Song not found.`,
                            flags: 64
                        });
                    }

                    // Check if user is already in the queue
                    const isAlreadyInQueue = session.queue.some(q => q.userId === interaction.user.id);
                    if (isAlreadyInQueue) {
                        return interaction.reply({
                            content: `${emoji.status.error} You are already in the queue! Use \`/queue remove\` to leave first.`,
                            flags: 64
                        });
                    }

                    session.queue.push({
                        userId: interaction.user.id,
                        username: interaction.user.username,
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
                            .setEmoji('📋'),
                        new ButtonBuilder()
                            .setCustomId(`queue_remove_${interaction.user.id}`)
                            .setLabel('Leave Queue')
                            .setStyle(ButtonStyle.Danger)
                            .setEmoji('❌')
                    );

                    const container = new ContainerBuilder()
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${emoji.status.success} Added to Queue!`))
                        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                            `**${interaction.user.username}** is queued to sing!\n\n` +
                            `${emoji.karaoke.music} **Song:** ${song.title}\n` +
                            `${emoji.karaoke.microphone} **Artist:** ${song.artist}\n` +
                            `${emoji.karaoke.position} **Position:** #${position} in queue\n` +
                            `${emoji.karaoke.timer} **Estimated wait:** ~${(position - 1) * 4} minutes`
                        ))
                        .addActionRowComponents(row);

                    return interaction.reply({ components: [container], flags: 32768 | 64 });
                } catch (error) {
                    console.error('queue_add error:', error);
                    return interaction.reply({ 
                        content: `${emoji.status.error} An error occurred: ${error.message}`, 
                        flags: 64 
                    }).catch(() => {});
                }
            }

            // ===== SEED SONGS BUTTONS =====
            if (customId === 'seed_songs_clear') {
                const isDev = this.client.config.ownerID?.includes(interaction.user.id);
                if (!isDev) return interaction.reply({ content: '❌ Developer only.', flags: 64 });
                
                const cmd = this.client.commands.get('seed-songs');
                if (cmd) {
                    const ctx = new Context(interaction, []);
                    interaction.options = { getSubcommand: () => 'clear' };
                    return cmd.run(ctx, ['clear']);
                }
            }

            if (customId === 'seed_songs_add') {
                const isDev = this.client.config.ownerID?.includes(interaction.user.id);
                if (!isDev) return interaction.reply({ content: '❌ Developer only.', flags: 64 });
                
                const cmd = this.client.commands.get('seed-songs');
                if (cmd) {
                    const ctx = new Context(interaction, []);
                    await interaction.deferReply({ flags: 64 });
                    return cmd.loadSongsFromInternet(ctx, true);
                }
            }

            // ===== DEV PANEL BUTTONS =====
            if (customId.startsWith('dev_')) {
                const isDev = this.client.config.ownerID?.includes(interaction.user.id);
                if (!isDev) return interaction.reply({ content: '❌ Developer only.', flags: 64 });
                
                const cmd = this.client.commands.get('dev');
                if (cmd) {
                    const ctx = new Context(interaction, []);
                    const action = customId.replace('dev_', '');
                    
                    if (action === 'stats') return cmd.showStats(ctx);
                    if (action === 'guilds') return cmd.showGuilds(ctx);
                    if (action === 'database') return cmd.showDatabase(ctx);
                    if (action === 'reload') {
                        return interaction.reply({ content: '🔄 Use `?reload <command>` to reload a specific command.', flags: 64 });
                    }
                }
            }

            // ===== QUICK RATING BUTTONS (1-5 stars) - DISABLED =====
            if (customId.startsWith('rate_') && customId.length === 6) {
                return interaction.reply({ content: `${emoji.status.error} The rating system is currently disabled.`, flags: 64 });
            }

            // ===== RATING BUTTONS - DISABLED =====
            if (customId === 'rate_current') {
                return interaction.reply({ content: `${emoji.status.error} The rating system is currently disabled.`, flags: 64 });
            }

            if (customId === 'rate_leaderboard') {
                return interaction.reply({ content: `${emoji.status.error} The rating system is currently disabled.`, flags: 64 });
            }

        } catch (error) {
            console.error('Button error:', error);
            return interaction.reply({ content: `${emoji.status.error} An error occurred.`, flags: 64 }).catch(() => {});
        }
    }


    async handleSelectMenu(interaction) {
        const customId = interaction.customId;

        try {
            // ===== SETUP SELECT MENUS =====
            if (customId === 'setup_text_channel') {
                if (!interaction.member.permissions.has('ManageGuild')) {
                    return interaction.reply({ content: `${emoji.status.error} You need \`Manage Server\` permission.`, flags: 64 });
                }

                const channelId = interaction.values[0];
                
                // Step 2: Voice Channel
                const voiceSelect = new ChannelSelectMenuBuilder()
                    .setCustomId('setup_voice_channel')
                    .setPlaceholder(`${emoji.karaoke.speaker} Select the karaoke voice/stage channel`)
                    .setChannelTypes([ChannelType.GuildVoice, ChannelType.GuildStageVoice]);

                const container = new ContainerBuilder()
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${emoji.karaoke.microphone} Karaoke Setup`))
                    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                        `${emoji.status.success} **Text Channel:** <#${channelId}>\n\n` +
                        `**Step 2 of 3:** Select the voice or stage channel\n` +
                        `This is where singers will perform. When users join:\n` +
                        `• They'll be automatically muted (audience)\n` +
                        `• When it's their turn to sing, they'll be unmuted\n` +
                        `• After singing, they'll be muted again\n\n` +
                        `💡 **Stage Channels** work great for karaoke!\n` +
                        `They have built-in speaker/audience roles.\n\n` +
                        `*Select a voice or stage channel below...*`
                    ))
                    .addActionRowComponents(new ActionRowBuilder().addComponents(voiceSelect));

                // Update the message instead of replying
                await interaction.update({ components: [container], flags: 32768 });
                
                // Save to DB (non-blocking)
                KaraokeSettings.findOneAndUpdate(
                    { guildId: interaction.guild.id },
                    { guildId: interaction.guild.id, karaokeChannelId: channelId, stickyChannelId: channelId },
                    { upsert: true }
                ).catch(() => {});
                
                return;
            }

            if (customId === 'setup_voice_channel') {
                if (!interaction.member.permissions.has('ManageGuild')) {
                    return interaction.reply({ content: `${emoji.status.error} You need \`Manage Server\` permission.`, flags: 64 });
                }

                const channelId = interaction.values[0];
                
                // Get settings first
                const settings = await KaraokeSettings.findOne({ guildId: interaction.guild.id }).catch(() => ({}));

                // Step 3: Event Manager Role
                const roleSelect = new RoleSelectMenuBuilder()
                    .setCustomId('setup_event_manager')
                    .setPlaceholder(`${emoji.karaoke.crown} Select the Event Manager role`);

                const container = new ContainerBuilder()
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${emoji.karaoke.microphone} Karaoke Setup`))
                    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                        `${emoji.status.success} **Text Channel:** <#${settings?.karaokeChannelId || 'unknown'}>\n` +
                        `${emoji.status.success} **Voice Channel:** <#${channelId}>\n\n` +
                        `**Step 3 of 3:** Select the Event Manager role\n` +
                        `This role can:\n` +
                        `• Start and stop karaoke sessions\n` +
                        `• Skip singers and manage the queue\n` +
                        `• They won't be auto-muted in voice\n\n` +
                        `*Select a role below...*`
                    ))
                    .addActionRowComponents(new ActionRowBuilder().addComponents(roleSelect));

                // Update the message
                await interaction.update({ components: [container], flags: 32768 });
                
                // Save (non-blocking)
                KaraokeSettings.findOneAndUpdate(
                    { guildId: interaction.guild.id },
                    { voiceChannelId: channelId },
                    { upsert: true }
                ).catch(() => {});
                
                return;
            }

            if (customId === 'setup_event_manager') {
                if (!interaction.member.permissions.has('ManageGuild')) {
                    return interaction.reply({ content: `${emoji.status.error} You need \`Manage Server\` permission.`, flags: 64 });
                }

                const roleId = interaction.values[0];
                
                // Save role first
                await KaraokeSettings.findOneAndUpdate(
                    { guildId: interaction.guild.id },
                    { eventManagerRoleId: roleId, djRoleId: roleId, requireDjRole: true },
                    { upsert: true }
                ).catch(() => {});

                // Get settings
                const settings = await KaraokeSettings.findOne({ guildId: interaction.guild.id }).catch(() => ({}));
                
                // Get server prefix
                const { default: PrefixSchema } = await import('../../schemas/prefix.js');
                const prefixData = await PrefixSchema.findById(interaction.guild.id).catch(() => null);
                const prefix = prefixData?.prefix || this.client.config.prefix || '!';

                // Step 4: Command Mode Selection (NEW)
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('setup_commandmode_automatic')
                        .setLabel('⚡ Automatic (Slash Commands)')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('setup_commandmode_manual')
                        .setLabel('🔧 Manual (Prefix Commands)')
                        .setStyle(ButtonStyle.Primary)
                );

                const container = new ContainerBuilder()
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${emoji.karaoke.microphone} Karaoke Setup`))
                    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                        `${emoji.status.success} **Text Channel:** <#${settings?.karaokeChannelId || 'unknown'}>\n` +
                        `${emoji.status.success} **Voice Channel:** <#${settings?.voiceChannelId || 'unknown'}>\n` +
                        `${emoji.status.success} **Event Manager:** <@&${roleId}>\n\n` +
                        `**Step 4:** Choose Command Mode\n\n` +
                        `**⚡ Automatic (Slash Commands):**\n` +
                        `Full featured with song catalog, lyrics, and interactive buttons.\n` +
                        `• Uses \`/karaoke\`, \`/queue\`, \`/songs\` commands\n` +
                        `• Auto-complete and discovery\n` +
                        `• Recommended for full karaoke experience\n` +
                        `• Continues to sticky messages setup\n\n` +
                        `**🔧 Manual (Prefix Commands):**\n` +
                        `Simplified queue management - NO song catalog required.\n` +
                        `• Uses \`${prefix}startqueue\`, \`${prefix}jq\`, \`${prefix}nextqueue\`, etc.\n` +
                        `• Users just join - no song names needed!\n` +
                        `• Event managers manage the queue order\n` +
                        `• Perfect for simple queue-only setups\n` +
                        `• Skips sticky messages - goes straight to finish!\n` +
                        `• Your server prefix: \`${prefix}\`\n\n` +
                        `*Select your preferred command mode...*`
                    ))
                    .addActionRowComponents(row);

                return interaction.update({ components: [container], flags: 32768 });
            }

            // ===== SONG SELECTION =====
            if (customId === 'song_select_queue') {
                const songId = interaction.values[0];
                
                const session = await KaraokeQueue.findOne({ guildId: interaction.guild.id, isActive: true }).catch(() => null);
                if (!session) {
                    return interaction.reply({ content: `${emoji.status.error} No active karaoke session. Ask Event Manager to start one!`, flags: 64 });
                }

                // Check if queue is locked
                if (session.isLocked) {
                    return interaction.reply({ content: `${emoji.status.error} The queue is currently **locked**. Please wait for an Event Manager to unlock it.`, flags: 64 });
                }

                const song = await Song.findOne({ songId }).catch(() => null);
                if (!song) {
                    return interaction.reply({ content: `${emoji.status.error} Song not found.`, flags: 64 });
                }

                // Check if user is already in the queue
                const isAlreadyInQueue = session.queue.some(q => q.userId === interaction.user.id);
                if (isAlreadyInQueue) {
                    return interaction.reply({ content: `${emoji.status.error} You are already in the queue! Use \`/queue remove\` to leave first.`, flags: 64 });
                }

                session.queue.push({
                    userId: interaction.user.id,
                    username: interaction.user.username,
                    songId: song.songId,
                    songTitle: song.title,
                    addedAt: new Date()
                });
                await session.save().catch(() => {});

                const position = session.queue.length;

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('queue_view').setLabel('View Queue').setStyle(ButtonStyle.Primary).setEmoji('📋'),
                    new ButtonBuilder().setCustomId(`queue_remove_${interaction.user.id}`).setLabel('Leave Queue').setStyle(ButtonStyle.Danger).setEmoji('❌')
                );

                const container = new ContainerBuilder()
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${emoji.status.success} You're in the Queue!`))
                    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                        `**${interaction.user.username}** is ready to sing!\n\n` +
                        `${emoji.karaoke.music} **Song:** ${song.title}\n` +
                        `${emoji.karaoke.microphone} **Artist:** ${song.artist}\n` +
                        `${emoji.karaoke.position} **Position:** #${position}\n` +
                        `${emoji.karaoke.timer} **Est. wait:** ~${(position - 1) * 4} min\n\n` +
                        `*You'll be unmuted when it's your turn!*`
                    ))
                    .addActionRowComponents(row);

                return interaction.update({ components: [container], flags: 32768 });
            }

            // ===== RATING - DISABLED =====
            if (customId === 'rate_select') {
                return interaction.reply({ content: `${emoji.status.error} The rating system is currently disabled.`, flags: 64 });
            }

            // ===== ONLINE SONG ADD =====
            if (customId === 'online_song_add') {
                const value = interaction.values[0];
                const parts = value.split('_');
                const title = parts[1] || 'Unknown';
                const artist = parts[2] || 'Unknown';
                const genre = parts[3] || 'Unknown';

                const existing = await Song.findOne({
                    title: { $regex: `^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
                    artist: { $regex: `^${artist.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' }
                }).catch(() => null);

                if (existing) {
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`queue_add_${existing.songId}`).setLabel('🎤 Sing This').setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId('songbook_online').setLabel('🌐 Search More').setStyle(ButtonStyle.Primary)
                    );
                    const container = new ContainerBuilder()
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent('# ℹ️ Song Exists'))
                        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**${existing.title}** by **${existing.artist}** is already in the songbook!`))
                        .addActionRowComponents(row);
                    return interaction.update({ components: [container], flags: 32768 });
                }

                const songId = `${title.substring(0, 3).toUpperCase()}${artist.substring(0, 3).toUpperCase()}${Date.now().toString(36).slice(-4)}`.replace(/\s/g, '');
                const song = await Song.create({ songId, title, artist, genre, addedBy: interaction.user.id }).catch(() => null);

                if (!song) {
                    return interaction.reply({ content: '❌ Failed to add song.', flags: 64 });
                }

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`queue_add_${song.songId}`).setLabel('🎤 Sing This').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('songbook_online').setLabel('🌐 Add More').setStyle(ButtonStyle.Primary)
                );

                const container = new ContainerBuilder()
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent('# ✅ Song Added!'))
                    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                        `**${song.title}** by **${song.artist}**\n\n🆔 \`${song.songId}\` • ${song.genre}`
                    ))
                    .addActionRowComponents(row);

                return interaction.update({ components: [container], flags: 32768 });
            }

            // ===== HELP CATEGORY SELECTION =====
            if (customId === 'help_category') {
                const category = interaction.values[0];
                
                // Block dev category completely
                if (category === 'dev') {
                    return interaction.reply({ content: '❌ This category is not available.', flags: 64 });
                }
                
                // Get commands for this category (exclude dev commands)
                const commands = this.client.commands.filter(cmd => {
                    if ((cmd.category || 'other') !== category) return false;
                    if (cmd.permissions?.dev || cmd.category === 'dev') return false;
                    return true;
                });
                
                if (commands.size === 0) {
                    return interaction.reply({ content: '❌ No commands found in this category.', flags: 64 });
                }

                const categoryEmojis = {
                    'info': '📖',
                    'karaoke': '🎤',
                    'config': '⚙️',
                    'dev': '🛠️',
                    'moderation': '🛡️',
                    'fun': '🎮',
                    'music': '🎵',
                    'utility': '🔧',
                    'other': '📦'
                };
                const emojiIcon = categoryEmojis[category?.toLowerCase()] || '📦';
                const categoryName = category.charAt(0).toUpperCase() + category.slice(1);

                // Build command list - detailed for karaoke category
                let commandList = '';
                
                if (category === 'karaoke') {
                    // Detailed karaoke commands
                    commandList = `**🎤 Session Management**\n` +
                        `\`/karaoke start\` - Start a karaoke session\n` +
                        `\`/karaoke stop\` - End the current session\n` +
                        `\`/karaoke status\` - View session status\n\n` +
                        
                        `**📋 Queue Commands**\n` +
                        `\`/queue view\` - View the current queue\n` +
                        `\`/queue add <song>\` - Join the queue with a song\n` +
                        `\`/queue remove\` - Remove yourself from queue\n` +
                        `\`/queue skip\` - Skip to next singer *(Event Manager)*\n` +
                        `\`/queue kick @user\` - Remove a user from queue *(Event Manager)*\n` +
                        `\`/queue lock\` - Lock/unlock the queue *(Event Manager)*\n` +
                        `\`/queue clear\` - Clear entire queue *(Event Manager)*\n\n` +
                        
                        `**🎵 Song Catalog**\n` +
                        `\`/songs\` - Browse 300+ songs A-Z\n` +
                        `\`🔍 Search Song\` - Search by number, title, or artist\n` +
                        `\`🌐 Search Online\` - Find songs from Deezer/iTunes\n\n` +
                        
                        `**🔇 Mute System**\n` +
                        `\`/mute user @user\` - Mute a specific user\n` +
                        `\`/mute all\` - Mute all audience members\n` +
                        `\`/mute unmute-all\` - Unmute everyone\n\n` +
                        
                        `**⚙️ Setup**\n` +
                        `\`/karaoke-setup wizard\` - Configure karaoke\n` +
                        `\`/karaoke-setup view\` - View/edit settings\n` +
                        `\`/karaoke-setup reset\` - Reset all settings\n\n`;
                } else {
                    // Generic command list for other categories
                    commands.forEach(cmd => {
                        const usage = cmd.description?.usage ? ` ${cmd.description.usage}` : '';
                        commandList += `**\`/${cmd.name}${usage}\`**\n${cmd.description?.content || 'No description'}\n\n`;
                    });
                }

                // Rebuild category select menu (exclude dev category completely)
                const categories = {};
                this.client.commands.forEach(cmd => {
                    // Skip dev commands completely
                    if (cmd.permissions?.dev || cmd.category === 'dev') return;
                    
                    const cat = cmd.category || 'other';
                    if (!categories[cat]) categories[cat] = [];
                    categories[cat].push(cmd);
                });

                const categoryDescriptions = {
                    'info': 'Bot information & help commands',
                    'karaoke': 'Karaoke session & queue management',
                    'config': 'Server configuration commands',
                    'dev': 'Developer-only commands',
                    'moderation': 'Server moderation tools',
                    'fun': 'Fun & entertainment commands',
                    'music': 'Music playback commands',
                    'utility': 'Utility & tools',
                    'other': 'Various commands'
                };

                const categoryOptions = Object.keys(categories).map(cat => ({
                    label: `${cat.charAt(0).toUpperCase() + cat.slice(1)} (${categories[cat].length})`,
                    description: categoryDescriptions[cat?.toLowerCase()] || 'Various commands',
                    value: cat,
                    emoji: categoryEmojis[cat?.toLowerCase()] || '📦',
                    default: cat === category
                }));

                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('help_category')
                    .setPlaceholder('📂 Select a category to view commands...')
                    .addOptions(categoryOptions);

                const row = new ActionRowBuilder().addComponents(selectMenu);

                const container = new ContainerBuilder()
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${emojiIcon} ${categoryName} Commands`))
                    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                        `${commandList}` +
                        `───────────────────\n\n` +
                        `**💡 Tip:** Use \`/help <command>\` for detailed info\n` +
                        `📊 **Commands in ${categoryName}:** ${commands.size}`
                    ))
                    .addActionRowComponents(row);

                return interaction.update({ components: [container], flags: 32768 });
            }

        } catch (error) {
            console.error('Select menu error:', error);
            return interaction.reply({ content: '❌ An error occurred.', flags: 64 }).catch(() => {});
        }
    }

    async handleModalSubmit(interaction) {
        const customId = interaction.customId;

        try {
            // ===== SONG SEARCH MODAL =====
            if (customId === 'modal_song_search') {
                const query = interaction.fields.getTextInputValue('search_query').trim();
                
                let songs = [];
                
                // Check if query is a number (song number from songbook)
                const songNumber = parseInt(query);
                if (!isNaN(songNumber) && songNumber > 0) {
                    // Get song by its position in the sorted list
                    const allSongs = await Song.find().sort({ title: 1 }).skip(songNumber - 1).limit(1).catch(() => []);
                    if (allSongs.length > 0) {
                        songs = allSongs;
                    }
                }
                
                // If not a number or no result, search by title/artist
                if (songs.length === 0) {
                    songs = await Song.find({
                        $or: [
                            { title: { $regex: query, $options: 'i' } },
                            { artist: { $regex: query, $options: 'i' } }
                        ]
                    }).sort({ title: 1 }).limit(25).catch(() => []);
                }

                if (songs.length === 0) {
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('songbook_online_modal')
                            .setLabel('🌐 Search Online Instead')
                            .setStyle(ButtonStyle.Primary)
                    );

                    const container = new ContainerBuilder()
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent('# 🔍 No Results'))
                        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                            `No songs found for "**${query}**" in the songbook.\n\nClick below to search online!`
                        ))
                        .addActionRowComponents(row);

                    return interaction.reply({ components: [container], flags: 32768 | 64 });
                }

                // Create select menu for song selection
                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('song_select_queue')
                    .setPlaceholder('🎤 Select a song to join the queue...')
                    .addOptions(songs.map(s => ({
                        label: s.title.substring(0, 100),
                        description: s.artist.substring(0, 100),
                        value: s.songId
                    })));

                const row = new ActionRowBuilder().addComponents(selectMenu);
                const browseRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('songbook_online_modal')
                        .setLabel('🌐 Search Online')
                        .setStyle(ButtonStyle.Primary)
                );

                const songList = songs.slice(0, 10).map((s, i) => {
                    return `${i + 1}. **${s.title}**\n   *${s.artist}*`;
                }).join('\n\n');

                const container = new ContainerBuilder()
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🔍 Search: "${query}"`))
                    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                        `Found **${songs.length}** result(s):\n\n${songList}${songs.length > 10 ? `\n\n... and ${songs.length - 10} more in dropdown` : ''}`
                    ))
                    .addActionRowComponents(row)
                    .addActionRowComponents(browseRow);

                return interaction.reply({ components: [container], flags: 32768 | 64 });
            }

            // ===== SONG SELECT MODAL (Join Queue) =====
            if (customId === 'modal_song_select') {
                const query = interaction.fields.getTextInputValue('song_search').trim();
                
                const session = await KaraokeQueue.findOne({ guildId: interaction.guild.id, isActive: true }).catch(() => null);
                if (!session) {
                    return interaction.reply({ content: `${emoji.status.error} No active karaoke session. Ask Event Manager to start one!`, flags: 64 });
                }

                // Check if queue is locked
                if (session.isLocked) {
                    return interaction.reply({ content: `${emoji.status.error} The queue is currently **locked**. Please wait for an Event Manager to unlock it.`, flags: 64 });
                }

                let songs = [];
                
                // Check if query is a number (song number from songbook)
                const songNumber = parseInt(query);
                if (!isNaN(songNumber) && songNumber > 0) {
                    const allSongs = await Song.find().sort({ title: 1 }).skip(songNumber - 1).limit(1).catch(() => []);
                    if (allSongs.length > 0) {
                        songs = allSongs;
                    }
                }
                
                // If not a number or no result, search by title/artist
                if (songs.length === 0) {
                    songs = await Song.find({
                        $or: [
                            { title: { $regex: query, $options: 'i' } },
                            { artist: { $regex: query, $options: 'i' } }
                        ]
                    }).sort({ title: 1 }).limit(25).catch(() => []);
                }

                if (songs.length === 0) {
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('songbook_online_modal')
                            .setLabel('🌐 Search Online Instead')
                            .setStyle(ButtonStyle.Primary)
                    );

                    const container = new ContainerBuilder()
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent('# 🔍 No Results'))
                        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                            `No songs found for "**${query}**".\n\nClick below to search online and add new songs!`
                        ))
                        .addActionRowComponents(row);

                    return interaction.reply({ components: [container], flags: 32768 | 64 });
                }

                // Create select menu for song selection
                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('song_select_queue')
                    .setPlaceholder('🎤 Select a song to join the queue...')
                    .addOptions(songs.map(s => ({
                        label: s.title.substring(0, 100),
                        description: s.artist.substring(0, 100),
                        value: s.songId
                    })));

                const row = new ActionRowBuilder().addComponents(selectMenu);
                const browseRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('songbook_online_modal')
                        .setLabel('🌐 Search Online')
                        .setStyle(ButtonStyle.Primary)
                );

                const songList = songs.slice(0, 8).map((s, i) => {
                    return `${i + 1}. **${s.title}** - *${s.artist}*`;
                }).join('\n');

                const container = new ContainerBuilder()
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🎤 Select Your Song`))
                    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                        `Results for "**${query}**":\n\n${songList}${songs.length > 8 ? `\n\n... and ${songs.length - 8} more` : ''}\n\n*Select from dropdown to join queue*`
                    ))
                    .addActionRowComponents(row)
                    .addActionRowComponents(browseRow);

                return interaction.reply({ components: [container], flags: 32768 | 64 });
            }

            // ===== ONLINE SEARCH MODAL =====
            if (customId === 'modal_online_search') {
                const query = interaction.fields.getTextInputValue('online_query');
                
                await interaction.deferReply({ flags: 64 });
                return this.performOnlineSearch(interaction, query);
            }

            // ===== STICKY DELAY MODAL =====
            if (customId === 'modal_sticky_delay') {
                if (!interaction.member.permissions.has('ManageGuild')) {
                    return interaction.reply({ content: `${emoji.status.error} You need \`Manage Server\` permission.`, flags: 64 });
                }
                
                const delayStr = interaction.fields.getTextInputValue('delay_seconds');
                const delay = parseInt(delayStr);
                
                if (isNaN(delay) || delay < 5 || delay > 300) {
                    return interaction.reply({ content: `${emoji.status.error} Please enter a number between 5 and 300 seconds.`, flags: 64 });
                }
                
                await KaraokeSettings.findOneAndUpdate(
                    { guildId: interaction.guild.id },
                    { stickyDelay: delay },
                    { upsert: true }
                ).catch(() => {});
                
                // Refresh the settings container
                return this.refreshSettingsContainer(interaction);
            }

            // ===== SETUP WIZARD STICKY DELAY MODAL =====
            if (customId === 'modal_setup_sticky_delay') {
                if (!interaction.member.permissions.has('ManageGuild')) {
                    return interaction.reply({ content: `${emoji.status.error} You need \`Manage Server\` permission.`, flags: 64 });
                }
                
                const delayStr = interaction.fields.getTextInputValue('delay_seconds');
                const delay = parseInt(delayStr);
                
                if (isNaN(delay) || delay < 5 || delay > 300) {
                    return interaction.reply({ content: `${emoji.status.error} Please enter a number between 5 and 300 seconds.`, flags: 64 });
                }
                
                // Save delay and enable sticky with delay mode
                await KaraokeSettings.findOneAndUpdate(
                    { guildId: interaction.guild.id },
                    { stickyEnabled: true, stickyMode: 'delay', stickyDelay: delay },
                    { upsert: true }
                ).catch(() => {});
                
                // Get updated settings and show confirmation
                const settings = await KaraokeSettings.findOne({ guildId: interaction.guild.id }).catch(() => null);
                return this.showSetupConfirmation(interaction, settings);
            }

        } catch (error) {
            console.error('Modal submit error:', error);
            return interaction.reply({ content: '❌ An error occurred.', flags: 64 }).catch(() => {});
        }
    }

    async performOnlineSearch(interaction, query) {
        let results = [];

        const fetchWithTimeout = async (url, timeout = 8000) => {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), timeout);
            try {
                const res = await fetch(url, { 
                    signal: controller.signal,
                    headers: { 'Accept': 'application/json', 'User-Agent': 'KaraokeBot/1.0' }
                });
                clearTimeout(id);
                return res;
            } catch (e) {
                clearTimeout(id);
                throw e;
            }
        };

        // Try Deezer first
        try {
            const deezerUrl = `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=20`;
            const response = await fetchWithTimeout(deezerUrl);
            const data = await response.json();
            
            if (data.data?.length > 0) {
                const seen = new Set();
                for (const track of data.data) {
                    const key = `${track.title?.toLowerCase()}-${track.artist?.name?.toLowerCase()}`;
                    if (!seen.has(key) && track.title && track.artist?.name) {
                        seen.add(key);
                        results.push({
                            title: track.title,
                            artist: track.artist.name,
                            genre: 'Music',
                            duration: track.duration || 0
                        });
                    }
                    if (results.length >= 15) break;
                }
            }
        } catch (err) {
            console.error('Deezer API error:', err.message);
        }

        // Fallback to iTunes
        if (results.length === 0) {
            try {
                const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=20`;
                const response = await fetchWithTimeout(itunesUrl);
                const data = await response.json();
                
                if (data.results?.length > 0) {
                    const seen = new Set();
                    for (const track of data.results) {
                        const key = `${track.trackName?.toLowerCase()}-${track.artistName?.toLowerCase()}`;
                        if (!seen.has(key) && track.trackName && track.artistName) {
                            seen.add(key);
                            results.push({
                                title: track.trackName,
                                artist: track.artistName,
                                genre: track.primaryGenreName || 'Unknown',
                                duration: Math.floor((track.trackTimeMillis || 0) / 1000)
                            });
                        }
                        if (results.length >= 15) break;
                    }
                }
            } catch (err) {
                console.error('iTunes API error:', err.message);
            }
        }

        if (results.length === 0) {
            const container = new ContainerBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent('# ❌ No Results'))
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `Could not find songs for "**${query}**" online.\n\nTry a different search term!`
                ));
            return interaction.editReply({ components: [container], flags: 32768 });
        }

        // Create select menu
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('online_song_add')
            .setPlaceholder('➕ Select a song to add to songbook...')
            .addOptions(results.map((s, i) => ({
                label: s.title.substring(0, 100),
                description: `${s.artist} • ${s.genre}`.substring(0, 100),
                value: `${i}_${s.title.substring(0, 30)}_${s.artist.substring(0, 30)}_${s.genre.substring(0, 15)}`.substring(0, 100)
            })));

        const row = new ActionRowBuilder().addComponents(selectMenu);

        const songList = results.slice(0, 10).map((s, i) => {
            const duration = s.duration ? `${Math.floor(s.duration / 60)}:${(s.duration % 60).toString().padStart(2, '0')}` : '';
            return `${i + 1}. **${s.title}**\n   *${s.artist}* ${duration ? `• ${duration}` : ''}`;
        }).join('\n\n');

        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🌐 Online: "${query}"`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `Found **${results.length}** songs:\n\n${songList}\n\n*Select to add to songbook*`
            ))
            .addActionRowComponents(row);

        return interaction.editReply({ components: [container], flags: 32768 });
    }

    async handleAutocomplete(interaction) {
        const focusedOption = interaction.options.getFocused(true);
        
        if (focusedOption.name === 'song') {
            const query = focusedOption.value;
            const songs = await Song.find({
                $or: [
                    { title: { $regex: query, $options: 'i' } },
                    { artist: { $regex: query, $options: 'i' } }
                ]
            }).sort({ title: 1 }).limit(25).catch(() => []);

            return interaction.respond(songs.map(s => ({
                name: `${s.title} - ${s.artist}`.substring(0, 100),
                value: s.songId
            })));
        }
    }

    async refreshSettingsContainer(interaction) {
        const settings = await KaraokeSettings.findOne({ guildId: interaction.guild.id }).catch(() => null);
        
        if (!settings) {
            return interaction.reply({ content: `${emoji.status.error} Settings not found.`, flags: 64 });
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

        return interaction.update({ components: [container], flags: 32768 });
    }

    async showSetupConfirmation(interaction, settings) {
        // Refresh settings
        const freshSettings = await KaraokeSettings.findOne({ guildId: interaction.guild.id }).catch(() => settings);
        
        // Get server prefix
        const { default: PrefixSchema } = await import('../../schemas/prefix.js');
        const prefixData = await PrefixSchema.findById(interaction.guild.id).catch(() => null);
        const prefix = prefixData?.prefix || this.client.config.prefix || '!';
        
        const commandMode = freshSettings?.commandMode || 'automatic';
        const commandModeDisplay = commandMode === 'automatic' ? 'Slash Commands (/)' : 'Prefix Commands';
        
        const stickyMode = freshSettings?.stickyMode || 'sticky';
        const stickyDelay = freshSettings?.stickyDelay || 30;
        let stickyDisplay = '';
        if (!freshSettings?.stickyEnabled) {
            stickyDisplay = 'Disabled';
        } else if (stickyMode === 'sticky') {
            stickyDisplay = 'Sticky (always on top)';
        } else {
            stickyDisplay = `Delay (${stickyDelay}s)`;
        }

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('setup_confirm')
                .setLabel('✅ Confirm & Finish')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('setup_start_wizard')
                .setLabel('🔄 Start Over')
                .setStyle(ButtonStyle.Secondary)
        );

        // Different instructions based on command mode
        const modeInstructions = commandMode === 'manual'
            ? `**🔧 Manual Mode (Prefix Commands):**\n` +
              `• Event Manager uses \`${prefix}startqueue\` to begin\n` +
              `• Users join with just \`${prefix}joinqueue\` or \`${prefix}jq\`\n` +
              `• Event Manager uses \`${prefix}nextqueue\` to call next person\n` +
              `• Simple queue management - no song catalog!`
            : `**⚡ Automatic Mode (Slash Commands):**\n` +
              `• Event Manager uses \`/karaoke start\`\n` +
              `• Users browse \`/songs\` and add to queue\n` +
              `• Full featured with lyrics, ratings, etc.\n` +
              `• Interactive buttons and auto-complete`;

        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${emoji.karaoke.microphone} Confirm Setup`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `**Please confirm your settings:**\n\n` +
                `${emoji.karaoke.tv} **Text Channel:** <#${freshSettings?.karaokeChannelId || 'unknown'}>\n` +
                `${emoji.karaoke.speaker} **Voice Channel:** <#${freshSettings?.voiceChannelId || 'unknown'}>\n` +
                `${emoji.karaoke.crown} **Event Manager:** <@&${freshSettings?.eventManagerRoleId || 'unknown'}>\n` +
                `⚙️ **Command Mode:** ${commandModeDisplay}\n` +
                `${emoji.karaoke.mute} **Auto-Mute:** Enabled\n` +
                `📌 **Sticky Messages:** ${stickyDisplay}\n` +
                (commandMode === 'manual' ? `⌨️ **Server Prefix:** \`${prefix}\`\n` : '') +
                `\n${emoji.misc.divider}\n\n` +
                modeInstructions + `\n\n` +
                `${emoji.misc.divider}\n\n` +
                `**${emoji.karaoke.mute} Auto-Mute Feature:**\n` +
                `When you confirm, the bot will join the voice channel.\n` +
                `• All audience members will be muted\n` +
                `• Leaving the channel unmutes you\n` +
                `• Current singer gets unmuted automatically\n` +
                `• Event Managers are never muted\n\n` +
                `*Click Confirm to finish setup!*`
            ))
            .addActionRowComponents(row);

        return interaction.update({ components: [container], flags: 32768 });
    }

    async fetchLyricsFromGenius(songTitle, songId) {
        const GENIUS_API_KEY = process.env.GENIUS_API_KEY;
        
        if (!GENIUS_API_KEY) {
            console.warn('⚠️ GENIUS_API_KEY not found in .env - lyrics feature will not work');
            return null;
        }

        try {
            // Check if we have cached lyrics in database
            const song = await Song.findOne({ songId }).catch(() => null);
            
            // Only use cached lyrics if they're actual lyrics (not just a link)
            if (song?.lyrics && !song.lyrics.includes('View full lyrics at:') && song.lyrics.length > 100) {
                console.log('✓ Using cached lyrics for:', songTitle);
                return song.lyrics;
            }

            console.log('🔍 Fetching fresh lyrics for:', songTitle);

            // Import genius-lyrics dynamically
            const { Client: GeniusClient } = await import('genius-lyrics');

            // Initialize Genius client
            const geniusClient = new GeniusClient(GENIUS_API_KEY);

            // Search for the song
            const searches = await geniusClient.songs.search(songTitle);
            
            if (!searches || searches.length === 0) {
                console.log('❌ No search results for:', songTitle);
                return null;
            }

            // Get the first result
            const firstSong = searches[0];
            console.log(`📝 Found: "${firstSong.title}" by ${firstSong.artist.name}`);

            // Fetch full lyrics
            const lyricsText = await firstSong.lyrics();
            
            if (!lyricsText || lyricsText.length < 50) {
                console.log('❌ No lyrics text available');
                return null;
            }

            console.log('✓ Successfully fetched lyrics, length:', lyricsText.length);

            // Cache the lyrics in database
            if (song) {
                song.lyrics = lyricsText;
                await song.save().catch(() => {});
                console.log('💾 Cached lyrics in database');
            }

            return lyricsText;
            
        } catch (error) {
            console.error('❌ Lyrics fetch error:', error.message);
            return null;
        }
    }

    splitLyrics(lyrics, maxLength) {
        if (lyrics.length <= maxLength) {
            return [lyrics];
        }

        const chunks = [];
        let currentChunk = '';
        const lines = lyrics.split('\n');

        for (const line of lines) {
            if ((currentChunk + line + '\n').length > maxLength) {
                if (currentChunk) {
                    chunks.push(currentChunk.trim());
                    currentChunk = '';
                }
                
                // If single line is too long, split it
                if (line.length > maxLength) {
                    chunks.push(line.substring(0, maxLength));
                    continue;
                }
            }
            currentChunk += line + '\n';
        }

        if (currentChunk) {
            chunks.push(currentChunk.trim());
        }

        return chunks;
    }
}
