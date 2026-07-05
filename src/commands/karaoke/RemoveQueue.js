import Command from "../../structures/Command.js";
import { KaraokeQueue, KaraokeSettings } from "../../schemas/karaoke.js";
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const emoji = require("../../data/emoji.json");

export default class RemoveQueue extends Command {
    constructor(client) {
        super(client, {
            name: 'removequeue',
            description: {
                content: 'Remove a user from the queue (Event Manager only - bypasses locked queue)',
                usage: '<@user>',
                examples: ['removequeue @User'],
            },
            aliases: ['kickqueue', 'qremove', 'qkick'],
            category: 'karaoke',
            cooldown: 3,
            permissions: {
                dev: false,
                client: ['SendMessages', 'ViewChannel', 'EmbedLinks'],
                user: [],
            },
            slashCommand: false // Prefix command only
        });
    }

    async run(ctx, args) {
        // Check for Event Manager permission
        const settings = await KaraokeSettings.findOne({ guildId: ctx.guild.id }).catch(() => null);
        if (!settings?.isConfigured) {
            return ctx.sendMessage(`${emoji.status.error} Karaoke system is not configured.`);
        }

        const isEventManager = settings.eventManagerRoleId && ctx.member.roles.cache.has(settings.eventManagerRoleId);
        const isAdmin = ctx.member.permissions.has('ManageChannels');
        
        if (!isEventManager && !isAdmin) {
            return ctx.sendMessage(`${emoji.status.error} Only Event Managers can remove users from the queue.`);
        }

        const session = await KaraokeQueue.findOne({ 
            guildId: ctx.guild.id, 
            isActive: true 
        }).catch(() => null);

        if (!session) {
            return ctx.sendMessage(`${emoji.status.error} No active karaoke session.`);
        }

        // Parse user mention
        const userMention = args[0];
        if (!userMention) {
            return ctx.sendMessage(`${emoji.status.error} Please mention a user! Usage: \`.removequeue @user\``);
        }

        const userId = userMention.replace(/[<@!>]/g, '');
        const member = await ctx.guild.members.fetch(userId).catch(() => null);
        
        if (!member) {
            return ctx.sendMessage(`${emoji.status.error} User not found!`);
        }

        // Find user in queue
        const queueIndex = session.queue.findIndex(q => q.userId === member.id);
        
        if (queueIndex === -1) {
            return ctx.sendMessage(`${emoji.status.error} **${member.user.username}** is not in the queue.`);
        }

        // Remove from queue
        const removed = session.queue.splice(queueIndex, 1)[0];
        await session.save().catch(() => {});

        return ctx.sendMessage(
            `${emoji.status.success} **${member.user.username}** has been removed from the queue!\n\n` +
            `${emoji.karaoke.music} **Song:** ${removed.songTitle}\n` +
            `${emoji.karaoke.queue} **New queue size:** ${session.queue.length} singers`
        );
    }
}
