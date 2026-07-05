import Command from "../../structures/Command.js";
import { KaraokeQueue, Song, KaraokeSettings } from "../../schemas/karaoke.js";
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const emoji = require("../../data/emoji.json");

export default class AddQueue extends Command {
    constructor(client) {
        super(client, {
            name: 'addqueue',
            description: {
                content: 'Add a user to the queue (Event Manager only - bypasses locked queue)',
                usage: '<@user> <song>',
                examples: ['addqueue @User Song Title', 'addqueue @User 123'],
            },
            aliases: ['addtoqueue', 'qadd'],
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
            return ctx.sendMessage(`${emoji.status.error} Karaoke system is not configured. Use \`/karaoke-setup wizard\` first.`);
        }

        const isEventManager = settings.eventManagerRoleId && ctx.member.roles.cache.has(settings.eventManagerRoleId);
        const isAdmin = ctx.member.permissions.has('ManageChannels');
        
        if (!isEventManager && !isAdmin) {
            return ctx.sendMessage(`${emoji.status.error} Only Event Managers can add users to the queue.`);
        }

        const session = await KaraokeQueue.findOne({ 
            guildId: ctx.guild.id, 
            isActive: true 
        }).catch(() => null);

        if (!session) {
            return ctx.sendMessage(`${emoji.status.error} No active karaoke session. Start one with \`/karaoke start\` or \`.startqueue\`!`);
        }

        // Parse user mention
        const userMention = args[0];
        if (!userMention) {
            return ctx.sendMessage(`${emoji.status.error} Please mention a user! Usage: \`.addqueue @user song\``);
        }

        const userId = userMention.replace(/[<@!>]/g, '');
        const member = await ctx.guild.members.fetch(userId).catch(() => null);
        
        if (!member) {
            return ctx.sendMessage(`${emoji.status.error} User not found!`);
        }

        // Get song query
        const songQuery = args.slice(1).join(' ');
        if (!songQuery) {
            return ctx.sendMessage(`${emoji.status.error} Please specify a song! Usage: \`.addqueue @user song\``);
        }

        const song = await Song.findOne({
            $or: [
                { songId: songQuery },
                { title: { $regex: songQuery, $options: 'i' } }
            ]
        }).catch(() => null);

        if (!song) {
            return ctx.sendMessage(`${emoji.status.error} Song "${songQuery}" not found. Use \`/songs\` to browse.`);
        }

        // Check if user is already in the queue
        const isAlreadyInQueue = session.queue.some(q => q.userId === member.id);
        if (isAlreadyInQueue) {
            return ctx.sendMessage(`${emoji.status.error} ${member.user.username} is already in the queue!`);
        }

        // Add to queue (bypasses lock)
        session.queue.push({
            userId: member.id,
            username: member.user.username,
            songId: song.songId,
            songTitle: song.title,
            addedAt: new Date()
        });
        await session.save().catch(() => {});

        const position = session.queue.length;

        return ctx.sendMessage(
            `${emoji.status.success} **${member.user.username}** has been added to the queue!\n\n` +
            `${emoji.karaoke.music} **Song:** ${song.title}\n` +
            `${emoji.karaoke.microphone} **Artist:** ${song.artist}\n` +
            `${emoji.karaoke.position} **Position:** #${position}\n` +
            `${emoji.karaoke.timer} **Est. wait:** ~${(position - 1) * 4} min\n\n` +
            `*${session.isLocked ? '🔒 Queue is locked but Event Manager added this user.' : ''}*`
        );
    }
}
