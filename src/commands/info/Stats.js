import Command from "../../structures/Command.js";
import { version, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder } from 'discord.js';
import os from 'os';

export default class Stats extends Command {
    constructor(client) {
        super(client, {
            name: 'stats',
            description: {
                content: 'Display bot statistics.',
                usage: 'stats',
                examples: ['stats'],
            },
            aliases: ['statistics', 'botstat'],
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
        const totalSeconds = Math.floor(this.client.uptime / 1000);
        const days = Math.floor(totalSeconds / 86400);
        const hours = Math.floor(totalSeconds / 3600) % 24;
        const minutes = Math.floor(totalSeconds / 60) % 60;
        const seconds = totalSeconds % 60;
        
        const uptime = `${days}d ${hours}h ${minutes}m ${seconds}s`;
        
        const memoryUsage = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
        const totalMemory = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);
        const freeMemory = (os.freemem() / 1024 / 1024 / 1024).toFixed(2);
        
        // Calculate total users from all guilds (more accurate than cache)
        const totalUsers = this.client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
        
        const container = new ContainerBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent('# 📊 Bot Statistics')
            )
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `**🤖 Bot Info**\n` +
                    `Servers: ${this.client.guilds.cache.size.toLocaleString()} | Users: ${totalUsers.toLocaleString()}\n` +
                    `Channels: ${this.client.channels.cache.size.toLocaleString()} | Commands: ${this.client.commands.size}\n\n` +
                    `**⏰ Uptime:** ${uptime}\n` +
                    `**🏓 Ping:** ${Math.round(this.client.ws.ping)}ms\n\n` +
                    `**💾 Memory**\n` +
                    `Used: ${memoryUsage} MB | Free: ${freeMemory} GB | Total: ${totalMemory} GB\n\n` +
                    `**🖥️ System**\n` +
                    `Platform: ${os.platform()} | CPU Cores: ${os.cpus().length}\n` +
                    `Node.js: ${process.version} | Discord.js: v${version}`
                )
            );
        
        return ctx.sendMessage({ components: [container], flags: 32768 });
    }
}
