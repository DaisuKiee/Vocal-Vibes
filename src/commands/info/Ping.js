import Command from "../../structures/Command.js"; 
import { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder } from "discord.js";

export default class Ping extends Command {
    constructor(client) {
        super(client, {
            name: 'ping',
            description: {
                content: 'Check the bot\'s latency and response time.',
                usage: 'ping',
                examples: ['ping'],
            },
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
        const msg = await ctx.sendDeferMessage('🏓 Pinging...');

        const botLatency = msg.createdTimestamp - ctx.createdTimestamp;
        const apiLatency = Math.round(ctx.client.ws.ping);

        const container = new ContainerBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent('# 🏓 Pong!')
            )
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `**Bot Latency:** \`${botLatency}ms\`\n` +
                    `**API Latency:** \`${apiLatency}ms\`\n\n` +
                    `${botLatency < 100 ? '🟢' : botLatency < 200 ? '🟡' : '🔴'} Connection is ${botLatency < 100 ? 'excellent' : botLatency < 200 ? 'good' : 'slow'}`
                )
            );

        return await ctx.editMessage({ content: '', components: [container], flags: 32768 });
    }
}
