import Event from "../../structures/Event.js";
import { KaraokeSettings, KaraokeQueue } from "../../schemas/karaoke.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder } from "discord.js";

export default class StickyMessage extends Event {
    constructor(...args) {
        super(...args, {
            name: 'messageCreate'
        });
        
        // Store delay timers per channel
        this.delayTimers = new Map();
    }

    async run(message) {
        // Ignore bots and DMs
        if (message.author.bot || !message.guild) return;

        try {
            // Check if there's an active karaoke session with sticky enabled
            const settings = await KaraokeSettings.findOne({ 
                guildId: message.guild.id,
                stickyEnabled: true,
                stickyChannelId: message.channel.id
            }).catch(() => null);

            if (!settings) return;

            const session = await KaraokeQueue.findOne({ 
                guildId: message.guild.id, 
                isActive: true 
            }).catch(() => null);

            if (!session) return;

            const stickyMode = settings.stickyMode || 'sticky';
            const stickyDelay = settings.stickyDelay || 30;
            const channelKey = `${message.guild.id}_${message.channel.id}`;

            if (stickyMode === 'delay') {
                // Delay mode: Clear existing timer and set new one
                if (this.delayTimers.has(channelKey)) {
                    clearTimeout(this.delayTimers.get(channelKey));
                }

                // Set timer to resend after delay
                const timer = setTimeout(async () => {
                    this.delayTimers.delete(channelKey);
                    await this.sendStickyMessage(message.channel, settings, session);
                }, stickyDelay * 1000);

                this.delayTimers.set(channelKey, timer);
            } else {
                // Sticky mode: Resend immediately (with debounce)
                const now = Date.now();
                if (this.client.lastStickyUpdate && now - this.client.lastStickyUpdate < 3000) {
                    return;
                }
                this.client.lastStickyUpdate = now;

                await this.sendStickyMessage(message.channel, settings, session);
            }

        } catch (error) {
            // Silently fail - don't spam console
        }
    }

    async sendStickyMessage(channel, settings, session) {
        try {
            // Delete old sticky message
            if (settings.stickyMessageId) {
                try {
                    const oldMsg = await channel.messages.fetch(settings.stickyMessageId);
                    if (oldMsg) await oldMsg.delete();
                } catch (e) {
                    // Message might already be deleted
                }
            }

            // Refresh session data
            const freshSession = await KaraokeQueue.findOne({ 
                guildId: channel.guild.id, 
                isActive: true 
            }).catch(() => session);

            if (!freshSession) return;

            // Check command mode
            const commandMode = settings.commandMode || 'automatic';
            const isManualMode = commandMode === 'manual';

            // Create new sticky message
            let queueList;
            if (isManualMode) {
                // Manual mode: Show only usernames
                queueList = freshSession.queue.length > 0
                    ? freshSession.queue.slice(0, 10).map((q, i) => `${i + 1}. **${q.username}**`).join('\n')
                    : 'No one in queue yet!';
            } else {
                // Automatic mode: Show usernames and songs
                queueList = freshSession.queue.length > 0
                    ? freshSession.queue.slice(0, 10).map((q, i) => `${i + 1}. **${q.username}** - ${q.songTitle}`).join('\n')
                    : 'No one in queue yet!';
            }

            let currentSinger;
            if (isManualMode) {
                // Manual mode: Show only user
                currentSinger = freshSession.currentSinger?.userId
                    ? `🎙️ **Now Singing:** <@${freshSession.currentSinger.userId}>`
                    : '🎙️ Waiting for first singer...';
            } else {
                // Automatic mode: Show user and song
                currentSinger = freshSession.currentSinger?.userId
                    ? `🎙️ **Now Singing:** <@${freshSession.currentSinger.userId}>\n🎵 **Song:** ${freshSession.currentSinger.songTitle}`
                    : '🎙️ Waiting for first singer...';
            }

            // Queue lock status
            const lockStatus = freshSession.isLocked ? '\n\n🔒 **Queue is LOCKED** - No new entries allowed' : '';

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('karaoke_join')
                    .setLabel('🎤 Join Queue')
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(freshSession.isLocked),
                new ButtonBuilder()
                    .setCustomId('karaoke_songs')
                    .setLabel('🎵 Browse Songs')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('karaoke_queue')
                    .setLabel('📋 Full Queue')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('karaoke_next')
                    .setLabel('⏭️ Next')
                    .setStyle(ButtonStyle.Secondary)
            );

            const container = new ContainerBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🎤 Karaoke Queue${freshSession.isLocked ? ' 🔒' : ''}`))
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `${currentSinger}\n\n` +
                    `**📋 Up Next (${freshSession.queue.length}):**\n${queueList}${lockStatus}\n\n` +
                    `${freshSession.isLocked ? '*Queue is locked by Event Manager*' : '*Click a button to join or browse songs!*'}`
                ))
                .addActionRowComponents(row);

            const stickyMsg = await channel.send({ components: [container], flags: 32768 });

            // Update settings with new message ID
            settings.stickyMessageId = stickyMsg.id;
            await settings.save();

        } catch (error) {
            // Silently fail
        }
    }
}
