import Command from "../../structures/Command.js";
import { KaraokeQueue, KaraokeSettings } from "../../schemas/karaoke.js";
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const emoji = require("../../data/emoji.json");

export default class MoveQueue extends Command {
    constructor(client) {
        super(client, {
            name: 'movequeue',
            description: {
                content: 'Move a user to a different position in the queue (Event Manager only)',
                usage: '<@user> <position>',
                examples: ['movequeue @User 1', 'movequeue @User 5'],
            },
            aliases: ['qmove', 'repositionqueue', 'mq'],
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
            return ctx.sendMessage(`${emoji.status.error} Only Event Managers can move users in the queue.`);
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
            return ctx.sendMessage(`${emoji.status.error} Please mention a user! Usage: \`.movequeue @user position\``);
        }

        const userId = userMention.replace(/[<@!>]/g, '');
        const member = await ctx.guild.members.fetch(userId).catch(() => null);
        
        if (!member) {
            return ctx.sendMessage(`${emoji.status.error} User not found!`);
        }

        // Parse position
        const newPosition = parseInt(args[1]);
        if (!newPosition || newPosition < 1) {
            return ctx.sendMessage(`${emoji.status.error} Please provide a valid position (1 or greater)! Usage: \`.movequeue @user position\``);
        }

        // Find user in queue
        const queueIndex = session.queue.findIndex(q => q.userId === member.id);
        
        if (queueIndex === -1) {
            return ctx.sendMessage(`${emoji.status.error} **${member.user.username}** is not in the queue.`);
        }

        // Validate new position
        if (newPosition > session.queue.length) {
            return ctx.sendMessage(`${emoji.status.error} Position ${newPosition} is out of range. Queue has ${session.queue.length} singers.`);
        }

        const oldPosition = queueIndex + 1;
        
        if (oldPosition === newPosition) {
            return ctx.sendMessage(`${emoji.status.warning} **${member.user.username}** is already at position ${newPosition}.`);
        }

        // Move user to new position
        const [user] = session.queue.splice(queueIndex, 1);
        session.queue.splice(newPosition - 1, 0, user);
        
        await session.save().catch(() => {});

        return ctx.sendMessage(
            `${emoji.status.success} **${member.user.username}** moved in queue!\n\n` +
            `${emoji.karaoke.music} **Song:** ${user.songTitle}\n` +
            `**Old position:** #${oldPosition}\n` +
            `**New position:** #${newPosition}\n\n` +
            `${emoji.karaoke.queue} Queue size: ${session.queue.length} singers`
        );
    }
}
