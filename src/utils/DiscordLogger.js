import { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder } from 'discord.js';

/**
 * Discord Channel Logger - Sends logs to specific Discord channels using Components V2
 */
export class DiscordLogger {
    constructor(client) {
        this.client = client;
        this.channels = {
            joinLeave: process.env.LOG_JOIN_LEAVE_CHANNEL,
            commands: process.env.LOG_COMMANDS_CHANNEL,
            errors: process.env.LOG_ERRORS_CHANNEL
        };
    }

    /**
     * Get a channel by ID
     */
    async getChannel(channelId) {
        if (!channelId) return null;
        try {
            return await this.client.channels.fetch(channelId);
        } catch {
            return null;
        }
    }

    /**
     * Log guild join with full server information
     */
    async logGuildJoin(guild) {
        const channel = await this.getChannel(this.channels.joinLeave);
        if (!channel) return;

        const owner = await guild.fetchOwner().catch(() => null);
        const createdAt = Math.floor(guild.createdTimestamp / 1000);
        
        // Count channels by type
        const textChannels = guild.channels.cache.filter(c => c.type === 0).size;
        const voiceChannels = guild.channels.cache.filter(c => c.type === 2).size;
        const categories = guild.channels.cache.filter(c => c.type === 4).size;
        
        // Count roles and boosts
        const roles = guild.roles.cache.size - 1;
        const boostLevel = guild.premiumTier;
        const boostCount = guild.premiumSubscriptionCount || 0;

        const container = new ContainerBuilder();
        
        // Header
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent('# 📥 Joined New Server')
        );

        // Server icon
        if (guild.iconURL({ size: 256 })) {
            container.addMediaGalleryComponents(
                new MediaGalleryBuilder().addItems(
                    new MediaGalleryItemBuilder()
                        .setURL(guild.iconURL({ size: 256 }))
                        .setDescription(guild.name)
                )
            );
        }

        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

        // Server info
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `**🏷️ Server Name:** ${guild.name}\n` +
                `**🆔 Server ID:** \`${guild.id}\`\n` +
                `**👑 Owner:** ${owner ? `${owner.user.tag} (\`${owner.id}\`)` : 'Unknown'}`
            )
        );

        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

        // Stats
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `**👥 Members:** ${guild.memberCount}\n` +
                `**📅 Created:** <t:${createdAt}:R>\n` +
                `**🚀 Boost:** Level ${boostLevel} (${boostCount} boosts)`
            )
        );

        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

        // Channels & Roles
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `**📁 Channels:**\n` +
                `> 💬 ${textChannels} Text | 🔊 ${voiceChannels} Voice | 📂 ${categories} Categories\n\n` +
                `**🎭 Roles:** ${roles}\n` +
                `**📊 Total Servers:** ${this.client.guilds.cache.size}`
            )
        );

        try {
            await channel.send({ components: [container], flags: 32768 });
        } catch (err) {
            this.client.logger.error(`Failed to send join log: ${err.message}`);
        }
    }

    /**
     * Log guild leave with server information
     */
    async logGuildLeave(guild) {
        const channel = await this.getChannel(this.channels.joinLeave);
        if (!channel) return;

        const container = new ContainerBuilder();

        // Header
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent('# 📤 Left Server')
        );

        // Server icon
        if (guild.iconURL({ size: 256 })) {
            container.addMediaGalleryComponents(
                new MediaGalleryBuilder().addItems(
                    new MediaGalleryItemBuilder()
                        .setURL(guild.iconURL({ size: 256 }))
                        .setDescription(guild.name)
                )
            );
        }

        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

        // Server info
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `**🏷️ Server Name:** ${guild.name}\n` +
                `**🆔 Server ID:** \`${guild.id}\`\n` +
                `**👥 Members:** ${guild.memberCount || 'Unknown'}\n` +
                `**📊 Total Servers:** ${this.client.guilds.cache.size}`
            )
        );

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`-# Left at <t:${Math.floor(Date.now() / 1000)}:F>`)
        );

        try {
            await channel.send({ components: [container], flags: 32768 });
        } catch (err) {
            this.client.logger.error(`Failed to send leave log: ${err.message}`);
        }
    }

    /**
     * Log command usage
     */
    async logCommand(ctx, commandName, args = []) {
        const channel = await this.getChannel(this.channels.commands);
        if (!channel) return;

        const user = ctx.author || ctx.interaction?.user;
        const guild = ctx.guild;
        const channelUsed = ctx.channel;

        const container = new ContainerBuilder();

        // Header
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent('# ⌨️ Command Used')
        );

        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

        // Command info
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `**📝 Command:** \`/${commandName}\`\n` +
                `**👤 User:** ${user?.tag || 'Unknown'} (\`${user?.id || 'N/A'}\`)\n` +
                `**🏠 Server:** ${guild ? `${guild.name} (\`${guild.id}\`)` : 'DM'}\n` +
                `**📍 Channel:** ${channelUsed ? `<#${channelUsed.id}>` : 'Unknown'}`
            )
        );

        if (args.length > 0) {
            const argsStr = args.slice(0, 5).join(', ') + (args.length > 5 ? '...' : '');
            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`**📋 Arguments:** \`${argsStr}\``)
            );
        }

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`-# <t:${Math.floor(Date.now() / 1000)}:F>`)
        );

        try {
            await channel.send({ components: [container], flags: 32768 });
        } catch (err) {
            this.client.logger.error(`Failed to send command log: ${err.message}`);
        }
    }

    /**
     * Log errors
     */
    async logError(error, context = {}) {
        const channel = await this.getChannel(this.channels.errors);
        if (!channel) return;

        const errorMessage = error?.message || String(error);
        const errorStack = error?.stack?.slice(0, 800) || 'No stack trace';

        const container = new ContainerBuilder();

        // Header
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent('# ❌ Error Occurred')
        );

        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

        // Error message
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `**📛 Error:**\n\`\`\`${errorMessage.slice(0, 500)}\`\`\``
            )
        );

        // Context info
        let contextStr = '';
        if (context.command) contextStr += `**📝 Command:** \`${context.command}\`\n`;
        if (context.user) contextStr += `**👤 User:** ${context.user.tag} (\`${context.user.id}\`)\n`;
        if (context.guild) contextStr += `**🏠 Server:** ${context.guild.name} (\`${context.guild.id}\`)\n`;
        
        if (contextStr) {
            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(contextStr)
            );
        }

        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

        // Stack trace
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `**📚 Stack Trace:**\n\`\`\`js\n${errorStack}\`\`\``
            )
        );

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`-# <t:${Math.floor(Date.now() / 1000)}:F>`)
        );

        try {
            await channel.send({ components: [container], flags: 32768 });
        } catch (err) {
            this.client.logger.error(`Failed to send error log: ${err.message}`);
        }
    }
}

export default DiscordLogger;
