import Command from "../../structures/Command.js"; 
import { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder } from "discord.js";

export default class About extends Command {
    constructor(client) {
        super(client, {
            name: 'about',
            description: {
                content: 'See information about this bot.',
                usage: 'about',
                examples: ['about'],
            },
            aliases: ["info", "botinfo"],
            category: 'info',
            cooldown: 3,
            permissions: {
                dev: false,
                client: ['SendMessages', 'ViewChannel', 'EmbedLinks'],
                user: [],
            },
            slashCommand: true,
        });
    }

    async run(ctx, args) {
        const container = new ContainerBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`# 🤖 ${this.client.user.username}`)
            )
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `**📊 Servers:** ${this.client.guilds.cache.size}\n` +
                    `**👥 Users:** ${this.client.users.cache.size}\n` +
                    `**📝 Commands:** ${this.client.commands.size}\n` +
                    `**🏓 Ping:** ${Math.round(this.client.ws.ping)}ms\n` +
                    `**⏱️ Online since:** <t:${Math.floor((Date.now() - this.client.uptime) / 1000)}:R>\n\n` +
                    `**💻 Node.js:** ${process.version}\n` +
                    `**📚 Discord.js:** v14.18.0\n` +
                    `**🔧 Prefix:** \`${this.client.config.prefix}\``
                )
            );
            
        return await ctx.sendMessage({ components: [container], flags: 32768 });
    }
}
