import { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import Command from "../../structures/Command.js";
import os from 'os';

export default class Dev extends Command {
    constructor(client) {
        super(client, {
            name: 'dev',
            description: {
                content: 'Developer panel - View bot stats, commands, and controls',
                usage: '',
                examples: ['dev'],
            },
            aliases: ['developer', 'devpanel', 'admin'],
            category: 'dev',
            cooldown: 3,
            permissions: {
                dev: true,
                client: ['SendMessages', 'ViewChannel', 'EmbedLinks'],
                user: [],
            },
            slashCommand: false, // Prefix only for security
            options: []
        });
    }

    async run(ctx, args) {
        const subcommand = args[0]?.toLowerCase();

        switch (subcommand) {
            case 'stats':
                return this.showStats(ctx);
            case 'commands':
            case 'cmds':
                return this.showCommands(ctx);
            case 'guilds':
            case 'servers':
                return this.showGuilds(ctx);
            case 'db':
            case 'database':
                return this.showDatabase(ctx);
            default:
                return this.showPanel(ctx);
        }
    }

    async showPanel(ctx) {
        const client = this.client;
        
        // Calculate uptime
        const uptime = process.uptime();
        const days = Math.floor(uptime / 86400);
        const hours = Math.floor((uptime % 86400) / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const uptimeStr = `${days}d ${hours}h ${minutes}m`;

        // Memory usage
        const memUsed = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
        const memTotal = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);

        // Get dev commands
        const devCommands = client.commands.filter(cmd => cmd.permissions?.dev || cmd.category === 'dev');
        const devCmdList = devCommands.map(cmd => `\`${cmd.name}\``).join(', ');

        // Guild count
        const guildCount = client.guilds.cache.size;
        const userCount = client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('dev_stats')
                .setLabel('📊 Stats')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('dev_guilds')
                .setLabel('🏠 Guilds')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('dev_database')
                .setLabel('🗄️ Database')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('dev_reload')
                .setLabel('🔄 Reload')
                .setStyle(ButtonStyle.Danger)
        );

        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('# 🛠️ Developer Panel'))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `**👋 Welcome, Developer!**\n\n` +
                `───────────────────\n\n` +
                `**📊 Quick Stats:**\n` +
                `• Guilds: **${guildCount.toLocaleString()}**\n` +
                `• Users: **${userCount.toLocaleString()}**\n` +
                `• Uptime: **${uptimeStr}**\n` +
                `• Memory: **${memUsed} MB**\n` +
                `• Ping: **${client.ws.ping}ms**\n\n` +
                `───────────────────\n\n` +
                `**🔧 Developer Commands:**\n${devCmdList}\n\n` +
                `**📝 Usage:**\n` +
                `\`?dev stats\` - Detailed statistics\n` +
                `\`?dev guilds\` - List all guilds\n` +
                `\`?dev db\` - Database info\n` +
                `\`?eval <code>\` - Execute code\n` +
                `\`?reload <cmd>\` - Reload command\n` +
                `\`?seed-songs confirm\` - Load songs\n` +
                `\`?leaveguild <id>\` - Leave a guild`
            ))
            .addActionRowComponents(row);

        return ctx.sendMessage({ components: [container], flags: 32768 });
    }

    async showStats(ctx) {
        const client = this.client;
        
        // System info
        const cpuUsage = os.loadavg()[0].toFixed(2);
        const memUsed = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
        const memRss = (process.memoryUsage().rss / 1024 / 1024).toFixed(2);
        const memTotal = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);
        const memFree = (os.freemem() / 1024 / 1024 / 1024).toFixed(2);
        
        // Uptime
        const uptime = process.uptime();
        const days = Math.floor(uptime / 86400);
        const hours = Math.floor((uptime % 86400) / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = Math.floor(uptime % 60);

        // Discord stats
        const guildCount = client.guilds.cache.size;
        const userCount = client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0);
        const channelCount = client.channels.cache.size;
        const commandCount = client.commands.size;

        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('# 📊 Detailed Statistics'))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `**🤖 Bot Stats:**\n` +
                `• Guilds: **${guildCount.toLocaleString()}**\n` +
                `• Users: **${userCount.toLocaleString()}**\n` +
                `• Channels: **${channelCount.toLocaleString()}**\n` +
                `• Commands: **${commandCount}**\n` +
                `• Ping: **${client.ws.ping}ms**\n\n` +
                `**⏱️ Uptime:**\n` +
                `${days}d ${hours}h ${minutes}m ${seconds}s\n\n` +
                `**💾 Memory:**\n` +
                `• Heap Used: **${memUsed} MB**\n` +
                `• RSS: **${memRss} MB**\n` +
                `• System Total: **${memTotal} GB**\n` +
                `• System Free: **${memFree} GB**\n\n` +
                `**🖥️ System:**\n` +
                `• Platform: **${os.platform()}**\n` +
                `• Arch: **${os.arch()}**\n` +
                `• CPU Load: **${cpuUsage}%**\n` +
                `• Node.js: **${process.version}**\n` +
                `• Discord.js: **v14**`
            ));

        return ctx.sendMessage({ components: [container], flags: 32768 });
    }

    async showGuilds(ctx) {
        const guilds = this.client.guilds.cache
            .sort((a, b) => b.memberCount - a.memberCount)
            .first(15);

        let guildList = '';
        guilds.forEach((g, i) => {
            guildList += `${i + 1}. **${g.name}**\n   ID: \`${g.id}\` • ${g.memberCount.toLocaleString()} members\n`;
        });

        const totalGuilds = this.client.guilds.cache.size;
        const totalUsers = this.client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0);

        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('# 🏠 Guild List'))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `**Top 15 Guilds by Members:**\n\n${guildList}\n` +
                `───────────────────\n\n` +
                `**📊 Total:** ${totalGuilds} guilds • ${totalUsers.toLocaleString()} users\n\n` +
                `*Use \`?leaveguild <id>\` to leave a guild*`
            ));

        return ctx.sendMessage({ components: [container], flags: 32768 });
    }

    async showDatabase(ctx) {
        // Import schemas
        const { Song, KaraokeQueue, KaraokeSettings } = await import('../../schemas/karaoke.js');
        const PrefixSchema = (await import('../../schemas/prefix.js')).default;

        // Get counts
        const songCount = await Song.countDocuments().catch(() => 0);
        const sessionCount = await KaraokeQueue.countDocuments({ isActive: true }).catch(() => 0);
        const settingsCount = await KaraokeSettings.countDocuments({ isConfigured: true }).catch(() => 0);
        const prefixCount = await PrefixSchema.countDocuments().catch(() => 0);

        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('# 🗄️ Database Info'))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `**📊 Collection Stats:**\n\n` +
                `🎵 **Songs:** ${songCount.toLocaleString()}\n` +
                `🎤 **Active Sessions:** ${sessionCount}\n` +
                `⚙️ **Configured Servers:** ${settingsCount}\n` +
                `🔧 **Custom Prefixes:** ${prefixCount}\n\n` +
                `───────────────────\n\n` +
                `**🔧 Database Commands:**\n` +
                `\`?seed-songs confirm\` - Load 300+ songs\n` +
                `\`?seed-songs clear\` - Clear & reload songs`
            ));

        return ctx.sendMessage({ components: [container], flags: 32768 });
    }
}
