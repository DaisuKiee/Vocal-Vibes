import Command from "../../structures/Command.js";
import { KaraokeQueue, KaraokeSettings } from "../../schemas/karaoke.js";
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const emoji = require("../../data/emoji.json");

export default class LockQueue extends Command {
    constructor(client) {
        super(client, {
            name: 'lockqueue',
            description: {
                content: 'Lock or unlock the queue to prevent/allow new entries (Event Manager only)',
                usage: '',
                examples: ['lockqueue', 'lcq'],
            },
            aliases: ['qlock', 'togglelock'],
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
            return ctx.sendMessage(`${emoji.status.error} Only Event Managers can lock/unlock the queue.`);
        }

        const session = await KaraokeQueue.findOne({ 
            guildId: ctx.guild.id, 
            isActive: true 
        }).catch(() => null);

        if (!session) {
            return ctx.sendMessage(`${emoji.status.error} No active karaoke session.`);
        }

        // Toggle lock status
        session.isLocked = !session.isLocked;
        await session.save().catch(() => {});

        const status = session.isLocked ? '🔒 **LOCKED**' : '🔓 **UNLOCKED**';
        const message = session.isLocked 
            ? 'Users can no longer join the queue. Event Managers can still add users with `.addqueue`.'
            : 'Users can now join the queue again!';

        return ctx.sendMessage(
            `${status}\n\n${message}\n\n` +
            `Current queue size: **${session.queue.length}** singers`
        );
    }
}
