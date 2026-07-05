import Event from '../../structures/Event.js';
import { KaraokeQueue, KaraokeSettings } from '../../schemas/karaoke.js';

export default class ClientReady extends Event {
    constructor(...args) {
        super(...args, {
            name: 'ready',
            once: true
        });
    }
    async run() {
        this.client.logger.ready(`Logged in as ${this.client.user.tag}`);
        this.client.logger.ready(`Serving ${this.client.guilds.cache.size} guilds with ${this.client.users.cache.size} users`);
        
        // Initialize Discord Logger for channel logging
        this.client.initDiscordLogger();
        
        // Auto-reconnect to karaoke voice channels
        await this.reconnectKaraokeChannels();
        
        // Initialize Top.gg auto-poster
        if (process.env.TOPGG_TOKEN) {
            try {
                const Topgg = await import('@top-gg/sdk');
                const Api = Topgg.Api || Topgg.default?.Api;
                
                if (Api) {
                    const api = new Api(process.env.TOPGG_TOKEN);
                    
                    // Post stats immediately
                    await api.postStats({
                        serverCount: this.client.guilds.cache.size
                    });
                    this.client.logger.ready(`Posted stats to Top.gg: ${this.client.guilds.cache.size} servers`);
                    
                    // Post stats every 30 minutes
                    setInterval(async () => {
                        try {
                            await api.postStats({
                                serverCount: this.client.guilds.cache.size
                            });
                            this.client.logger.log(`Posted stats to Top.gg: ${this.client.guilds.cache.size} servers`);
                        } catch (err) {
                            this.client.logger.error(`Top.gg post error: ${err.message}`);
                        }
                    }, 30 * 60 * 1000);
                } else {
                    this.client.logger.warn('Top.gg Api not found in SDK');
                }
            } catch (err) {
                this.client.logger.warn(`Top.gg integration not available: ${err.message}`);
            }
        }
        
        this.client.user.setPresence({
            activities: [
                {
                    name: `${this.client.config.prefix}help | ${this.client.guilds.cache.size} servers`,
                    type: 3, // Watching
                }
            ],
            status: 'online',
        });
    }

    async reconnectKaraokeChannels() {
        try {
            // Find all active karaoke sessions
            const activeSessions = await KaraokeQueue.find({ isActive: true }).catch(() => []);
            
            if (activeSessions.length === 0) {
                this.client.logger.log('No active karaoke sessions to reconnect');
                return;
            }

            this.client.logger.log(`Found ${activeSessions.length} active karaoke session(s), attempting to reconnect...`);

            const { joinVoiceChannel, VoiceConnectionStatus, entersState } = await import('@discordjs/voice');

            for (const session of activeSessions) {
                try {
                    // Get the guild
                    const guild = this.client.guilds.cache.get(session.guildId);
                    if (!guild) {
                        this.client.logger.warn(`Guild ${session.guildId} not found, skipping reconnect`);
                        continue;
                    }

                    // Get settings for voice channel
                    const settings = await KaraokeSettings.findOne({ guildId: session.guildId }).catch(() => null);
                    const voiceChannelId = settings?.voiceChannelId || session.voiceChannelId;

                    if (!voiceChannelId) {
                        this.client.logger.warn(`No voice channel configured for guild ${guild.name}, skipping`);
                        continue;
                    }

                    // Fetch the voice channel
                    const voiceChannel = await guild.channels.fetch(voiceChannelId).catch(() => null);
                    if (!voiceChannel) {
                        this.client.logger.warn(`Voice channel ${voiceChannelId} not found in ${guild.name}, skipping`);
                        continue;
                    }

                    // Join the voice channel
                    const connection = joinVoiceChannel({
                        channelId: voiceChannelId,
                        guildId: guild.id,
                        adapterCreator: guild.voiceAdapterCreator,
                        selfDeaf: false,
                        selfMute: true
                    });

                    await entersState(connection, VoiceConnectionStatus.Ready, 10000);
                    this.client.logger.ready(`Reconnected to karaoke VC in ${guild.name}`);

                } catch (err) {
                    this.client.logger.error(`Failed to reconnect to guild ${session.guildId}: ${err.message}`);
                }
            }

        } catch (error) {
            this.client.logger.error(`Error reconnecting karaoke channels: ${error.message}`);
        }
    }
}