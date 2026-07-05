import { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import Command from "../../structures/Command.js";

export default class Help extends Command {
    constructor(client) {
        super(client, {
            name: 'help',
            description: {
                content: 'Display all commands available to you',
                usage: '[command]',
                examples: ['help', 'help ping', 'help karaoke'],
            },
            aliases: ['h', 'commands', 'cmds'],
            category: 'info',
            cooldown: 3,
            permissions: {
                dev: false,
                client: ['SendMessages', 'ViewChannel', 'EmbedLinks'],
                user: [],
            },
            slashCommand: true,
            options: [
                {
                    name: "command",
                    description: "Get info on a specific command",
                    type: 3,
                    required: false,
                },
            ]
        });
    }

    async run(ctx, args) {
        const cmdName = ctx.isInteraction 
            ? ctx.interaction.options.getString('command')
            : args[0];

        if (cmdName) {
            return this.showCommand(ctx, cmdName);
        }
        
        return this.showCategories(ctx);
    }

    async showCommand(ctx, cmdName) {
        const command = this.client.commands.get(cmdName.toLowerCase()) || 
                       this.client.commands.get(this.client.aliases.get(cmdName.toLowerCase()));
        
        if (!command) {
            const container = new ContainerBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `❌ Command \`${cmdName}\` not found.\n\nUse \`/help\` to see all commands.`
                ));
            return ctx.sendMessage({ components: [container], flags: 32768 });
        }

        // Hide dev commands from non-developers
        if (command.permissions?.dev) {
            const isDev = this.client.config.ownerID?.includes(ctx.author.id);
            if (!isDev) {
                const container = new ContainerBuilder()
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                        `❌ Command \`${cmdName}\` not found.\n\nUse \`/help\` to see all commands.`
                    ));
                return ctx.sendMessage({ components: [container], flags: 32768 });
            }
        }
        
        const categoryEmoji = this.getCategoryEmoji(command.category);
        
        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${categoryEmoji} ${command.name}`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `${command.description.content || 'No description available.'}\n\n` +
                `**📝 Usage:**\n\`/${command.name} ${command.description.usage || ''}\`\n\n` +
                `**🏷️ Aliases:** ${command.aliases?.length ? command.aliases.map(a => `\`${a}\``).join(', ') : 'None'}\n` +
                `**📂 Category:** ${command.category?.charAt(0).toUpperCase() + command.category?.slice(1) || 'None'}\n` +
                `**⏱️ Cooldown:** ${command.cooldown || 3}s` +
                (command.description.examples?.length 
                    ? `\n\n**💡 Examples:**\n${command.description.examples.map(ex => `\`/${ex}\``).join('\n')}` 
                    : '')
            ));
            
        return ctx.sendMessage({ components: [container], flags: 32768 });
    }

    async showCategories(ctx) {
        // Group commands by category, excluding dev commands
        const categories = {};
        this.client.commands.forEach(cmd => {
            // Skip dev commands
            if (cmd.permissions?.dev || cmd.category === 'dev') return;
            
            const cat = cmd.category || 'other';
            if (!categories[cat]) categories[cat] = [];
            categories[cat].push(cmd);
        });

        // Build category options for select menu
        const categoryOptions = Object.keys(categories).map(cat => ({
            label: `${cat.charAt(0).toUpperCase() + cat.slice(1)} (${categories[cat].length})`,
            description: this.getCategoryDescription(cat),
            value: cat,
            emoji: this.getCategoryEmoji(cat)
        }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('help_category')
            .setPlaceholder('📂 Select a category to view commands...')
            .addOptions(categoryOptions);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        const buttonRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('📖 Documentation')
                .setStyle(ButtonStyle.Link)
                .setURL('https://vocals.filipino.gg/docs'),
            new ButtonBuilder()
                .setLabel('🏠 Website')
                .setStyle(ButtonStyle.Link)
                .setURL('https://vocals.filipino.gg')
        );

        // Build category overview
        let overview = '';
        for (const [cat, cmds] of Object.entries(categories)) {
            const emoji = this.getCategoryEmoji(cat);
            overview += `${emoji} **${cat.charAt(0).toUpperCase() + cat.slice(1)}** — ${cmds.length} commands\n`;
        }

        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('# 📚 Help Menu'))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `**Welcome to Karaoke Bot!** 🎤\n\n` +
                `Select a category below to view its commands.\n\n` +
                `───────────────────\n\n` +
                `**📂 Categories:**\n${overview}\n` +
                `───────────────────\n\n` +
                `**💡 Tips:**\n` +
                `• Use \`/help <command>\` for details\n` +
                `• Use \`/support\` for help & contact\n` +
                `• Use \`/invite\` to add the bot\n\n` +
                `📊 **Total Commands:** ${this.client.commands.size}`
            ))
            .addActionRowComponents(row)
            .addActionRowComponents(buttonRow);
        
        return ctx.sendMessage({ components: [container], flags: 32768 });
    }

    getCategoryEmoji(category) {
        const emojis = {
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
        return emojis[category?.toLowerCase()] || '📦';
    }

    getCategoryDescription(category) {
        const descriptions = {
            'info': 'Bot information & help commands',
            'karaoke': 'Karaoke session & queue management',
            'config': 'Server configuration commands',
            'dev': 'Developer-only commands',
            'moderation': 'Server moderation tools',
            'fun': 'Fun & entertainment commands',
            'music': 'Music playback commands',
            'utility': 'Utility & tools',
            'other': 'Other commands'
        };
        return descriptions[category?.toLowerCase()] || 'Various commands';
    }
}
