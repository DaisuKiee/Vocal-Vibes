import Command from "../../structures/Command.js";
import { KaraokeQueue, KaraokeSettings } from "../../schemas/karaoke.js";
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const emoji = require("../../data/emoji.json");

export default class ClearQueue extends Command {
    constructor(client) {
        super(client, {
            name: 'clearqueue',
            description: {
                content: 'Clear the entire karaoke queue (Event Manager only)',
                usage: '',
                examples: ['cq'],
            },
            aliases: ['qclear', 'emptyqueue'],
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

    async run(ctx) {
        // Check for Event Manager permission
        const settings = await KaraokeSettings.findOne({ guildId: ctx.guild.id }).catch(() => null);
        if (!settings?.isConfigured) {
            return ctx.sendMessage(`${emoji.status.error} Karaoke system is not configured.`);
        }

        const isEventManager = settings.eventManagerRoleId && ctx.member.roles.cache.has(settings.eventManagerRoleId);
        const isAdmin = ctx.member.permissions.has('ManageChannels');
        
        if (!isEventManager && !isAdmin) {
            return ctx.sendMessage(`${emoji.status.error} Only Event Managers can clear the queue.`);
        }

        const session = await KaraokeQueue.findOne({ 
            guildId: ctx.guild.id, 
            isActive: true 
        }).catch(() => null);

        if (!session) {
            return ctx.sendMessage(`${emoji.status.error} No active karaoke session.`);
        }

        const previousCount = session.queue.length;
        const hadCurrentSinger = session.currentSinger ? true : false;
        
        // Clear both waiting queue and current singer
        session.queue = [];
        session.currentSinger = null;
        await session.save().catch(() => {});

        let message = `${emoji.status.success} **Queue cleared!**\n\n`;
        
        if (hadCurrentSinger) {
            message += `Removed current singer and **${previousCount}** ${previousCount === 1 ? 'person' : 'people'} from waiting queue.`;
        } else {
            message += `Removed **${previousCount}** ${previousCount === 1 ? 'singer' : 'singers'} from the queue.`;
        }

        return ctx.sendMessage(message);
    }
}
