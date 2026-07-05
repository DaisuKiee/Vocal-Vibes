import { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import Command from "../../structures/Command.js";

export default class Invite extends Command {
    constructor(client) {
        super(client, {
            name: 'invite',
            description: {
                content: 'Get the bot invite link to add it to your server',
                usage: '',
                examples: ['invite'],
            },
            aliases: ['inv', 'add'],
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
        const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${this.client.config.clientId}&permissions=8&scope=bot%20applications.commands`;
        const supportUrl = this.client.config.supportServer || null;

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('🤖 Invite Bot')
                .setStyle(ButtonStyle.Link)
                .setURL(inviteUrl)
        );

        if (supportUrl) {
            row.addComponents(
                new ButtonBuilder()
                    .setLabel('🏠 Support Server')
                    .setStyle(ButtonStyle.Link)
                    .setURL(supportUrl)
            );
        }

        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('# 🎤 Invite Karaoke Bot'))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `**Add me to your server!**\n\n` +
                `Click the button below to invite the bot to your Discord server.\n\n` +
                `**Features:**\n` +
                `🎵 Karaoke queue management\n` +
                `📖 Songbook with 100+ songs\n` +
                `🌐 Online song search (iTunes)\n` +
                `🔇 Auto-mute audience in voice\n` +
                `⭐ Performance rating system\n` +
                `📊 Leaderboards & stats\n\n` +
                `*Thank you for using Karaoke Bot!*`
            ))
            .addActionRowComponents(row);

        return ctx.sendMessage({ components: [container], flags: 32768 });
    }
}
