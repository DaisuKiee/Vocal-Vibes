import { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import Command from "../../structures/Command.js";
import { Premium } from "../../schemas/premium.js";
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const emoji = require("../../data/emoji.json");

export default class PremiumCommand extends Command {
    constructor(client) {
        super(client, {
            name: 'premium',
            description: {
                content: 'Manage premium servers (Developer only)',
                usage: '<add|remove|list|info> [server_id]',
                examples: ['premium add 123456789', 'premium list', 'premium info 123456789'],
            },
            aliases: ['prem'],
            category: 'dev',
            cooldown: 3,
            permissions: {
                dev: true,
                client: ['SendMessages', 'ViewChannel', 'EmbedLinks'],
                user: [],
            },
            slashCommand: true,
            options: [
                {
                    name: 'add',
                    description: 'Add premium to a server',
                    type: 1,
                    options: [
                        {
                            name: 'server_id',
                            description: 'Server ID to add premium',
                            type: 3,
                            required: true
                        },
                        {
                            name: 'tier',
                            description: 'Premium tier',
                            type: 3,
                            required: false,
                            choices: [
                                { name: 'Basic', value: 'basic' },
                                { name: 'Pro', value: 'pro' }
                            ]
                        },
                        {
                            name: 'duration',
                            description: 'Duration in days (0 = permanent)',
                            type: 4,
                            required: false
                        }
                    ]
                },
                {
                    name: 'remove',
                    description: 'Remove premium from a server',
                    type: 1,
                    options: [
                        {
                            name: 'server_id',
                            description: 'Server ID to remove premium',
                            type: 3,
                            required: true
                        }
                    ]
                },
                {
                    name: 'list',
                    description: 'List all premium servers',
                    type: 1
                },
                {
                    name: 'info',
                    description: 'Get premium info for a server',
                    type: 1,
                    options: [
                        {
                            name: 'server_id',
                            description: 'Server ID to check',
                            type: 3,
                            required: false
                        }
                    ]
                },
                {
                    name: 'toggle-feature',
                    description: 'Toggle a premium feature',
                    type: 1,
                    options: [
                        {
                            name: 'server_id',
                            description: 'Server ID',
                            type: 3,
                            required: true
                        },
                        {
                            name: 'feature',
                            description: 'Feature to toggle',
                            type: 3,
                            required: true,
                            choices: [
                                { name: 'AI Announcer', value: 'aiAnnouncer' },
                                { name: 'Custom Announcements', value: 'customAnnouncements' },
                                { name: 'Priority Support', value: 'prioritySupport' }
                            ]
                        }
                    ]
                }
            ]
        });
    }

    async run(ctx, args) {
        const subcommand = ctx.isInteraction ? ctx.interaction.options.getSubcommand() : args[0]?.toLowerCase();

        switch (subcommand) {
            case 'add':
                return this.addPremium(ctx);
            case 'remove':
                return this.removePremium(ctx);
            case 'list':
                return this.listPremium(ctx);
            case 'info':
                return this.infoPremium(ctx);
            case 'toggle-feature':
                return this.toggleFeature(ctx);
            default:
                return this.showHelp(ctx);
        }
    }

    async addPremium(ctx) {
        const serverId = ctx.isInteraction 
            ? ctx.interaction.options.getString('server_id')
            : ctx.args[1];
        const tier = ctx.isInteraction 
            ? ctx.interaction.options.getString('tier') || 'pro'
            : ctx.args[2] || 'pro';
        const duration = ctx.isInteraction 
            ? ctx.interaction.options.getInteger('duration') || 0
            : parseInt(ctx.args[3]) || 0;

        if (!serverId) {
            return ctx.sendMessage({ content: `${emoji.status.error} Please provide a server ID!`, flags: 64 });
        }

        // Check if server exists
        const guild = this.client.guilds.cache.get(serverId);
        if (!guild) {
            return ctx.sendMessage({ content: `${emoji.status.error} Server not found! Make sure the bot is in that server.`, flags: 64 });
        }

        const expiresAt = duration > 0 ? new Date(Date.now() + duration * 24 * 60 * 60 * 1000) : null;

        await Premium.findOneAndUpdate(
            { guildId: serverId },
            {
                isPremium: true,
                premiumTier: tier,
                features: {
                    aiAnnouncer: tier === 'pro',
                    customAnnouncements: tier === 'pro',
                    prioritySupport: true
                },
                activatedAt: new Date(),
                expiresAt,
                activatedBy: ctx.author.id,
                updatedAt: new Date()
            },
            { upsert: true }
        );

        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${emoji.status.success} Premium Added!`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `**Server:** ${guild.name} (\`${serverId}\`)\n` +
                `**Tier:** ${tier.toUpperCase()}\n` +
                `**Duration:** ${duration > 0 ? `${duration} days` : 'Permanent'}\n` +
                `**Expires:** ${expiresAt ? `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>` : 'Never'}\n\n` +
                `**Features Enabled:**\n` +
                `${tier === 'pro' ? '✅' : '❌'} AI Voice Announcer\n` +
                `${tier === 'pro' ? '✅' : '❌'} Custom Announcements\n` +
                `✅ Priority Support`
            ));

        return ctx.sendMessage({ components: [container], flags: 32768 });
    }

    async removePremium(ctx) {
        const serverId = ctx.isInteraction 
            ? ctx.interaction.options.getString('server_id')
            : ctx.args[1];

        if (!serverId) {
            return ctx.sendMessage({ content: `${emoji.status.error} Please provide a server ID!`, flags: 64 });
        }

        const premium = await Premium.findOne({ guildId: serverId });
        if (!premium || !premium.isPremium) {
            return ctx.sendMessage({ content: `${emoji.status.error} This server doesn't have premium!`, flags: 64 });
        }

        await Premium.findOneAndUpdate(
            { guildId: serverId },
            {
                isPremium: false,
                premiumTier: 'free',
                features: {
                    aiAnnouncer: false,
                    customAnnouncements: false,
                    prioritySupport: false
                },
                expiresAt: null,
                updatedAt: new Date()
            }
        );

        const guild = this.client.guilds.cache.get(serverId);
        const guildName = guild ? guild.name : 'Unknown Server';

        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${emoji.status.warning} Premium Removed`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `**Server:** ${guildName} (\`${serverId}\`)\n\n` +
                `Premium has been removed from this server.`
            ));

        return ctx.sendMessage({ components: [container], flags: 32768 });
    }

    async listPremium(ctx) {
        const premiumServers = await Premium.find({ isPremium: true }).sort({ activatedAt: -1 });

        if (premiumServers.length === 0) {
            return ctx.sendMessage({ content: `${emoji.status.error} No premium servers found!`, flags: 64 });
        }

        let content = `**Total Premium Servers:** ${premiumServers.length}\n\n`;

        for (const prem of premiumServers.slice(0, 20)) {
            const guild = this.client.guilds.cache.get(prem.guildId);
            const guildName = guild ? guild.name : 'Unknown Server';
            const expires = prem.expiresAt ? `<t:${Math.floor(new Date(prem.expiresAt).getTime() / 1000)}:R>` : 'Never';
            
            content += `**${guildName}** (\`${prem.guildId}\`)\n`;
            content += `├ Tier: ${prem.premiumTier.toUpperCase()}\n`;
            content += `├ Expires: ${expires}\n`;
            content += `└ AI Announcer: ${prem.features.aiAnnouncer ? '✅' : '❌'}\n\n`;
        }

        if (premiumServers.length > 20) {
            content += `\n*...and ${premiumServers.length - 20} more*`;
        }

        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('# 💎 Premium Servers'))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

        return ctx.sendMessage({ components: [container], flags: 32768 });
    }

    async infoPremium(ctx) {
        const serverId = ctx.isInteraction 
            ? ctx.interaction.options.getString('server_id') || ctx.guild.id
            : ctx.args[1] || ctx.guild.id;

        const premium = await Premium.findOne({ guildId: serverId });
        const guild = this.client.guilds.cache.get(serverId);
        const guildName = guild ? guild.name : 'Unknown Server';

        if (!premium || !premium.isPremium) {
            const container = new ContainerBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent('# ℹ️ Server Info'))
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `**Server:** ${guildName} (\`${serverId}\`)\n\n` +
                    `**Status:** ❌ Free Tier\n\n` +
                    `This server does not have premium.`
                ));

            return ctx.sendMessage({ components: [container], flags: 32768 });
        }

        const expires = premium.expiresAt 
            ? `<t:${Math.floor(new Date(premium.expiresAt).getTime() / 1000)}:R>`
            : 'Never';
        const activated = premium.activatedAt 
            ? `<t:${Math.floor(new Date(premium.activatedAt).getTime() / 1000)}:R>`
            : 'Unknown';

        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('# 💎 Premium Server Info'))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `**Server:** ${guildName} (\`${serverId}\`)\n\n` +
                `**Status:** ✅ Premium Active\n` +
                `**Tier:** ${premium.premiumTier.toUpperCase()}\n` +
                `**Activated:** ${activated}\n` +
                `**Expires:** ${expires}\n` +
                `**Activated By:** <@${premium.activatedBy}>\n\n` +
                `**Features:**\n` +
                `${premium.features.aiAnnouncer ? '✅' : '❌'} AI Voice Announcer\n` +
                `${premium.features.customAnnouncements ? '✅' : '❌'} Custom Announcements\n` +
                `${premium.features.prioritySupport ? '✅' : '❌'} Priority Support`
            ));

        return ctx.sendMessage({ components: [container], flags: 32768 });
    }

    async toggleFeature(ctx) {
        const serverId = ctx.isInteraction 
            ? ctx.interaction.options.getString('server_id')
            : ctx.args[1];
        const feature = ctx.isInteraction 
            ? ctx.interaction.options.getString('feature')
            : ctx.args[2];

        if (!serverId || !feature) {
            return ctx.sendMessage({ content: `${emoji.status.error} Please provide server ID and feature!`, flags: 64 });
        }

        const premium = await Premium.findOne({ guildId: serverId });
        if (!premium || !premium.isPremium) {
            return ctx.sendMessage({ content: `${emoji.status.error} This server doesn't have premium!`, flags: 64 });
        }

        const currentValue = premium.features[feature];
        premium.features[feature] = !currentValue;
        premium.updatedAt = new Date();
        await premium.save();

        const guild = this.client.guilds.cache.get(serverId);
        const guildName = guild ? guild.name : 'Unknown Server';
        const featureName = feature.replace(/([A-Z])/g, ' $1').trim();

        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${emoji.status.success} Feature Toggled`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `**Server:** ${guildName}\n` +
                `**Feature:** ${featureName}\n` +
                `**Status:** ${!currentValue ? '✅ Enabled' : '❌ Disabled'}`
            ));

        return ctx.sendMessage({ components: [container], flags: 32768 });
    }

    async showHelp(ctx) {
        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('# 💎 Premium Management'))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `**Available Commands:**\n\n` +
                `\`/premium add <server_id> [tier] [days]\`\n` +
                `Add premium to a server\n\n` +
                `\`/premium remove <server_id>\`\n` +
                `Remove premium from a server\n\n` +
                `\`/premium list\`\n` +
                `List all premium servers\n\n` +
                `\`/premium info [server_id]\`\n` +
                `Get premium info for a server\n\n` +
                `\`/premium toggle-feature <server_id> <feature>\`\n` +
                `Toggle a premium feature`
            ));

        return ctx.sendMessage({ components: [container], flags: 32768 });
    }
}
