import Command from "../../structures/Command.js";
import { KaraokeQueue, KaraokeSettings } from "../../schemas/karaoke.js";
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const emoji = require("../../data/emoji.json");

export default class ShuffleQueue extends Command {
    constructor(client) {
        super(client, {
            name: 'shufflequeue',
            description: {
                content: 'Shuffle the karaoke queue randomly (Event Manager only)',
                usage: '',
                examples: ['shufflequeue'],
            },
            aliases: ['qshuffle', 'randomizequeue'],
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
            return ctx.sendMessage(`${emoji.status.error} Only Event Managers can shuffle the queue.`);
        }

        const session = await KaraokeQueue.findOne({ 
            guildId: ctx.guild.id, 
            isActive: true 
        }).catch(() => null);

        if (!session) {
            return ctx.sendMessage(`${emoji.status.error} No active karaoke session.`);
        }

        if (session.queue.length < 2) {
            return ctx.sendMessage(`${emoji.status.error} Queue must have at least 2 singers to shuffle.`);
        }

        // Fisher-Yates shuffle algorithm
        const shuffled = [...session.queue];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        
        session.queue = shuffled;
        await session.save().catch(() => {});

        // Show first 5 singers after shuffle
        let queuePreview = '';
        session.queue.slice(0, 5).forEach((q, i) => {
            queuePreview += `${i + 1}. ${q.username} - *${q.songTitle}*\n`;
        });
        if (session.queue.length > 5) {
            queuePreview += `\n... and ${session.queue.length - 5} more`;
        }

        return ctx.sendMessage(
            `🔀 **Queue shuffled!**\n\n` +
            `${emoji.karaoke.queue} **New order (${session.queue.length} singers):**\n` +
            queuePreview
        );
    }
}
