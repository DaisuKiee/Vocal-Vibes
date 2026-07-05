import { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import Command from "../../structures/Command.js";

export default class Support extends Command {
    constructor(client) {
        super(client, {
            name: 'support',
            description: {
                content: 'Get support server link and contact information',
                usage: '',
                examples: ['support'],
            },
            aliases: ['server', 'contact', 'discord'],
            category: 'info',
            cooldown: 5,
            permissions: {
                dev: false,
                client: ['SendMessages', 'ViewChannel', 'EmbedLinks'],
                user: [],
            },
            slashCommand: true,
            options: []
        });
    }

    async run(ctx) {
        const supportUrl = this.client.config.supportServer || null;
        const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${this.client.config.clientId}&permissions=8&scope=bot%20applications.commands`;

        const row = new ActionRowBuilder();
        
        if (supportUrl) {
            row.addComponents(
                new ButtonBuilder()
                    .setLabel('🏠 Join Support Server')
                    .setStyle(ButtonStyle.Link)
                    .setURL(supportUrl)
            );
        }

        row.addComponents(
            new ButtonBuilder()
                .setLabel('🤖 Invite Bot')
                .setStyle(ButtonStyle.Link)
                .setURL(inviteUrl)
        );

        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('# 💬 Support & Help'))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `**Need help? We're here for you!**\n\n` +
                `───────────────────\n\n` +
                `**🎤 About Karaoke Bot**\n` +
                `The ultimate Discord karaoke experience! Host karaoke nights with your friends, manage queues, browse songs, and rate performances.\n\n` +
                `**📋 Quick Start Guide:**\n` +
                `1. Use \`/karaoke-setup\` to configure the bot\n` +
                `2. Use \`/seed-songs confirm\` to load songs\n` +
                `3. Use \`/karaoke start\` to begin a session\n` +
                `4. Have fun singing! 🎵\n\n` +
                `**🆘 Getting Help:**\n` +
                `• Use \`/help\` to see all commands\n` +
                `• Use \`/help <command>\` for command details\n` +
                `${supportUrl ? '• Join our support server for assistance\n' : ''}` +
                `• Report bugs to the server admins\n\n` +
                `**❤️ Thank You!**\n` +
                `Thanks for using Karaoke Bot! We hope you have amazing karaoke nights with your friends and community.\n\n` +
                `*Made with 🎤 for Discord communities*`
            ))
            .addActionRowComponents(row);

        return ctx.sendMessage({ components: [container], flags: 32768 });
    }
}
