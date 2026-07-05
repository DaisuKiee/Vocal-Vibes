import Command from "../../structures/Command.js";
import { KaraokeQueue, KaraokeSettings } from "../../schemas/karaoke.js";
import { EmbedBuilder } from 'discord.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const emoji = require("../../data/emoji.json");

export default class LeaveQueue extends Command {
    constructor(client) {
        super(client, {
            name: 'leavequeue',
            description: {
                content: 'Leave the karaoke queue',
                usage: '',
                examples: ['leavequeue', 'lq'],
            },
            aliases: ['leave', 'qleave', 'exitqueue', 'lq'],
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
        const settings = await KaraokeSettings.findOne({ guildId: ctx.guild.id }).catch(() => null);
        if (!settings?.isConfigured) {
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle(`${emoji.status.error} Not Configured`)
                .setDescription(`Karaoke system is not configured.`);
            return ctx.sendMessage({ embeds: [embed] });
        }

        const session = await KaraokeQueue.findOne({ 
            guildId: ctx.guild.id, 
            isActive: true 
        }).catch(() => null);

        if (!session) {
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle(`${emoji.status.error} No Active Session`)
                .setDescription(`No active karaoke session.`);
            return ctx.sendMessage({ embeds: [embed] });
        }

        // Check if user is the current singer
        if (session.currentSinger?.userId === ctx.author.id) {
            // Clear current singer
            session.currentSinger = null;
            await session.save().catch(() => {});
            
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle(`${emoji.status.success} You've Left!`)
                .setDescription(
                    `${emoji.karaoke.queue} **Remaining singers:** ${session.queue.length}\n\n` +
                    `*You can rejoin anytime with \`.joinqueue\`*`
                );
            
            return ctx.sendMessage({ embeds: [embed] });
        }

        // Find user in waiting queue
        const queueIndex = session.queue.findIndex(q => q.userId === ctx.author.id);
        
        if (queueIndex === -1) {
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle(`${emoji.status.error} Not In Queue`)
                .setDescription(`You are not in the queue.`);
            return ctx.sendMessage({ embeds: [embed] });
        }

        // Remove from queue
        session.queue.splice(queueIndex, 1);
        await session.save().catch(() => {});

        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle(`${emoji.status.success} You've Left The Queue!`)
            .setDescription(
                `${emoji.karaoke.queue} **Remaining singers:** ${session.queue.length}\n\n` +
                `*You can rejoin anytime with \`.joinqueue\`*`
            );

        return ctx.sendMessage({ embeds: [embed] });
    }
}
