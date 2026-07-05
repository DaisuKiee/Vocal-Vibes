import { createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus, entersState } from '@discordjs/voice';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { Readable } from 'stream';

const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

export class TTSAnnouncer {
    constructor() {
        this.audioPlayers = new Map(); // guildId -> AudioPlayer
    }

    /**
     * Generate AI announcement text
     */
    async generateAnnouncement(type, data) {
        if (!genAI) return this.getFallbackAnnouncement(type, data);

        const prompts = {
            nextSinger: `Create a short, energetic announcement (max 30 words) for the next karaoke singer. Singer: ${data.username}, Song: ${data.songTitle}. Be fun and hype!`,
            queueUpdate: `Create a brief announcement (max 20 words) about the karaoke queue status. ${data.queueLength} singers waiting. Keep it upbeat!`,
            sessionStart: `Create a welcoming announcement (max 25 words) for starting a karaoke session. Make it exciting and inviting!`,
            sessionEnd: `Create a thank you announcement (max 20 words) for ending a karaoke session. Be warm and appreciative!`
        };

        try {
            const model = genAI.getGenerativeModel({ model: 'models/gemini-2.5-flash' });
            const result = await model.generateContent(prompts[type] || prompts.nextSinger);
            return result.response.text().trim();
        } catch (error) {
            console.error('AI announcement generation failed:', error.message);
            return this.getFallbackAnnouncement(type, data);
        }
    }

    /**
     * Fallback announcements if AI fails
     */
    getFallbackAnnouncement(type, data) {
        const fallbacks = {
            nextSinger: `Next up, ${data.username} will be singing ${data.songTitle}! Let's give them a warm welcome!`,
            queueUpdate: `We have ${data.queueLength} singers in the queue. Get ready to shine!`,
            sessionStart: `Welcome to karaoke night! Let's have some fun and sing our hearts out!`,
            sessionEnd: `Thank you all for joining us tonight! You were all amazing!`
        };
        return fallbacks[type] || fallbacks.nextSinger;
    }

    /**
     * Convert text to speech using Microsoft Edge TTS (free, natural voice)
     */
    async textToSpeech(text) {
        try {
            const tts = new MsEdgeTTS();
            
            // Available voices (all sound very natural):
            // en-US-GuyNeural - Male, friendly
            // en-US-JennyNeural - Female, warm
            // en-US-AriaNeural - Female, professional
            // en-US-DavisNeural - Male, energetic
            // en-US-TonyNeural - Male, deep
            
            await tts.setMetadata(
                'en-US-GuyNeural', // Change this to try different voices
                OUTPUT_FORMAT.WEBM_24KHZ_16BIT_MONO_OPUS
            );
            
            const { audioStream } = tts.toStream(text);
            const chunks = [];
            
            return new Promise((resolve, reject) => {
                audioStream.on('data', chunk => chunks.push(chunk));
                audioStream.on('end', () => resolve(Buffer.concat(chunks)));
                audioStream.on('error', reject);
            });
        } catch (error) {
            console.error('TTS error:', error);
            throw error;
        }
    }

    /**
     * Play announcement in voice channel
     */
    async playAnnouncement(connection, text) {
        try {
            // Ensure connection is ready
            await entersState(connection, VoiceConnectionStatus.Ready, 10000);

            // Generate speech
            const audioBuffer = await this.textToSpeech(text);
            const audioStream = Readable.from(audioBuffer);

            // Create audio resource
            const resource = createAudioResource(audioStream, {
                inputType: 'arbitrary'
            });

            // Get or create audio player for this guild
            const guildId = connection.joinConfig.guildId;
            let player = this.audioPlayers.get(guildId);

            if (!player) {
                player = createAudioPlayer();
                this.audioPlayers.set(guildId, player);
                connection.subscribe(player);

                // Clean up when idle
                player.on(AudioPlayerStatus.Idle, () => {
                    // Player finished, ready for next announcement
                });

                player.on('error', error => {
                    console.error('Audio player error:', error);
                });
            }

            // Play the announcement
            player.play(resource);

            return true;
        } catch (error) {
            console.error('Failed to play announcement:', error);
            return false;
        }
    }

    /**
     * Announce next singer
     */
    async announceNextSinger(connection, username, songTitle) {
        const text = await this.generateAnnouncement('nextSinger', { username, songTitle });
        return this.playAnnouncement(connection, text);
    }

    /**
     * Announce queue update
     */
    async announceQueueUpdate(connection, queueLength) {
        const text = await this.generateAnnouncement('queueUpdate', { queueLength });
        return this.playAnnouncement(connection, text);
    }

    /**
     * Announce session start
     */
    async announceSessionStart(connection) {
        const text = await this.generateAnnouncement('sessionStart', {});
        return this.playAnnouncement(connection, text);
    }

    /**
     * Announce session end
     */
    async announceSessionEnd(connection) {
        const text = await this.generateAnnouncement('sessionEnd', {});
        return this.playAnnouncement(connection, text);
    }

    /**
     * Clean up audio player for a guild
     */
    cleanup(guildId) {
        const player = this.audioPlayers.get(guildId);
        if (player) {
            player.stop();
            this.audioPlayers.delete(guildId);
        }
    }
}

export default new TTSAnnouncer();
