import Event from "../../structures/Event.js";
import { KaraokeQueue, KaraokeSettings } from "../../schemas/karaoke.js";

export default class VoiceStateUpdate extends Event {
    constructor(...args) {
        super(...args, {
            name: 'voiceStateUpdate'
        });
        
        // Track users who were muted in karaoke VC
        this.mutedUsers = new Map(); // guildId -> Set of userIds
    }

    async run(oldState, newState) {
        const joined = !oldState.channelId && newState.channelId;
        const left = oldState.channelId && !newState.channelId;
        const switched = oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId;

        if (!joined && !left && !switched) return;

        const guild = newState.guild || oldState.guild;
        const member = newState.member || oldState.member;
        
        if (!guild || !member || member.user.bot) return;

        try {
            const settings = await KaraokeSettings.findOne({ guildId: guild.id }).catch(() => null);
            if (!settings?.isConfigured) return;

            const karaokeVoiceId = settings.voiceChannelId;
            if (!karaokeVoiceId) return;

            // Check if event manager
            const isEventManager = settings.eventManagerRoleId && member.roles.cache.has(settings.eventManagerRoleId);
            if (isEventManager) return;

            // Initialize guild's muted users set
            if (!this.mutedUsers.has(guild.id)) {
                this.mutedUsers.set(guild.id, new Set());
            }
            const guildMutedUsers = this.mutedUsers.get(guild.id);

            // User joined a voice channel
            if (joined) {
                if (newState.channelId === karaokeVoiceId) {
                    // Joined karaoke VC - mute if session active
                    await this.handleJoinKaraoke(newState, settings, guildMutedUsers);
                } else {
                    // Joined a different VC - unmute if they were muted by karaoke
                    if (guildMutedUsers.has(member.id) || newState.serverMute) {
                        await newState.setMute(false, 'Karaoke: Joined different channel').catch(() => {});
                        guildMutedUsers.delete(member.id);
                    }
                }
            }
            // User switched channels
            else if (switched) {
                if (newState.channelId === karaokeVoiceId) {
                    // Switched TO karaoke VC - mute if session active
                    await this.handleJoinKaraoke(newState, settings, guildMutedUsers);
                } else if (oldState.channelId === karaokeVoiceId) {
                    // Switched FROM karaoke VC - unmute
                    await newState.setMute(false, 'Karaoke: Left karaoke channel').catch(() => {});
                    guildMutedUsers.delete(member.id);
                }
            }
            // User left voice completely
            else if (left && oldState.channelId === karaokeVoiceId) {
                // Track that they were muted so we can unmute when they rejoin any VC
                if (oldState.serverMute) {
                    guildMutedUsers.add(member.id);
                }
            }

        } catch (error) {
            console.error('VoiceStateUpdate error:', error);
        }
    }

    async handleJoinKaraoke(voiceState, settings, guildMutedUsers) {
        const member = voiceState.member;
        if (!member || !settings.autoMuteEnabled) return;

        const session = await KaraokeQueue.findOne({ 
            guildId: voiceState.guild.id, 
            isActive: true 
        }).catch(() => null);
        
        if (!session) return;

        // Check if this user is the current singer
        const isCurrentSinger = session.currentSinger?.userId === member.id;

        if (isCurrentSinger) {
            await voiceState.setMute(false, 'Karaoke: Current singer').catch(() => {});
            guildMutedUsers.delete(member.id);
        } else {
            await voiceState.setMute(true, 'Karaoke: Audience auto-mute').catch(() => {});
            guildMutedUsers.add(member.id);
        }
    }
}
