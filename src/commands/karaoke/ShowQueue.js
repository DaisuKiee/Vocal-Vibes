import Command from "../../structures/Command.js";
import { KaraokeQueue, KaraokeSettings } from "../../schemas/karaoke.js";
import { EmbedBuilder } from 'discord.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const emoji = require("../../data/emoji.json");

export default class ShowQueue extends Command {
    constructor(client) {
        super(client, {
            name: 'showqueue',
            description: {
                content: 'Check the people in the queue (Mods: in chat, Users: in DMs)',
                usage: '',
                examples: ['showqueue'],
            },
            aliases: ['viewqueue', 'queuelist', 'qlist', 'sq'],
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

        // Check command mode
        const commandMode = settings.commandMode || 'automatic';
        const isManualMode = commandMode === 'manual';

        // Check if user is Event Manager or has mod permissions
        const isEventManager = settings.eventManagerRoleId && ctx.member.roles.cache.has(settings.eventManagerRoleId);
        const isMod = ctx.member.permissions.has('ManageMessages') || ctx.member.permissions.has('ManageChannels');
        
        const sendInDM = !isEventManager && !isMod;

        // Build queue display
        let queueContent = '';
        
        // Check if there's a valid current singer (not just empty Mongoose object)
        const hasCurrentSinger = session.currentSinger && session.currentSinger.userId;
        
        if (hasCurrentSinger) {
            if (isManualMode) {
                // Manual mode: Show only user
                queueContent += `${emoji.karaoke.singing} **NOW SINGING:**\n<@${session.currentSinger.userId}>\n\n`;
            } else {
                // Automatic mode: Show user and song
                queueContent += `${emoji.karaoke.singing} **NOW SINGING:**\n<@${session.currentSinger.userId}> - *${session.currentSinger.songTitle}*\n\n`;
            }
        }

        if (session.queue.length === 0) {
            const joinCmd = isManualMode ? '`.joinqueue`' : '`.joinqueue <song>`';
            queueContent += `${emoji.karaoke.queue} **Queue is empty!**\nUse ${joinCmd} to join!`;
        } else {
            queueContent += `${emoji.karaoke.queue} **Queue (${session.queue.length} singers):**\n\n`;
            session.queue.forEach((q, i) => {
                if (isManualMode) {
                    // Manual mode: Show only position and user
                    queueContent += `**${i + 1}.** <@${q.userId}>\n`;
                } else {
                    // Automatic mode: Show position, user, and song
                    queueContent += `**${i + 1}.** <@${q.userId}> - *${q.songTitle}*\n`;
                }
            });
        }

        const embed = new EmbedBuilder()
            .setColor(this.client.color.default)
            .setTitle(`${emoji.karaoke.microphone} Karaoke Queue`)
            .setDescription(queueContent)
            .setFooter({ text: sendInDM ? 'Sent via DM' : 'Moderator view' })
            .setTimestamp();

        if (sendInDM) {
            // Send to DM
            try {
                await ctx.author.send({ embeds: [embed] });
                const confirmEmbed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle(`${emoji.status.success} Queue Sent!`)
                    .setDescription(`Check your DMs for the queue.`);
                return ctx.sendMessage({ embeds: [confirmEmbed] });
            } catch (error) {
                const errorEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle(`${emoji.status.error} Could Not Send DM`)
                    .setDescription(`Please enable DMs from server members.`);
                return ctx.sendMessage({ embeds: [errorEmbed] });
            }
        } else {
            // Send in channel (for mods/event managers)
            return ctx.sendMessage({ embeds: [embed] });
        }
    }
}
