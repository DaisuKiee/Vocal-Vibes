import Command from "../../structures/Command.js";
import { Song, KaraokeQueue } from "../../schemas/karaoke.js";
import { Client as GeniusClient } from 'genius-lyrics';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const emoji = require("../../data/emoji.json");

export default class Lyrics extends Command {
    constructor(client) {
        super(client, {
            name: 'lyrics',
            description: {
                content: 'View lyrics for the song you are currently singing',
                usage: 'lyrics',
                examples: ['lyrics'],
            },
            aliases: ['lyrics'],
            category: 'karaoke',
            cooldown: 5,
            permissions: {
                dev: false,
                client: ['SendMessages', 'ViewChannel', 'EmbedLinks'],
                user: [],
            },
            slashCommand: true,
            options: []
        });
    }

    async run(ctx) {
        // Find active session
        const session = await KaraokeQueue.findOne({ 
            guildId: ctx.guild.id, 
            isActive: true 
        }).catch(() => null);

        if (!session) {
            return ctx.sendMessage({
                content: `${emoji.status.error} No active karaoke session.`,
                flags: 64
            });
        }

        // Check if user is the current singer
        if (!session.currentSinger || session.currentSinger.userId !== ctx.author.id) {
            return ctx.sendMessage({
                content: `${emoji.status.error} You can only view lyrics when it's your turn to sing!`,
                flags: 64
            });
        }

        await ctx.sendMessage({
            content: `${emoji.karaoke.music} Fetching lyrics for **${session.currentSinger.songTitle}**...`,
            flags: 64
        });

        // Fetch lyrics
        const lyrics = await this.fetchLyrics(
            session.currentSinger.songTitle,
            session.currentSinger.songId
        );

        if (!lyrics) {
            return ctx.sendMessage({
                content: `${emoji.status.error} Could not find lyrics for **${session.currentSinger.songTitle}**. The song might not be available in the lyrics database.`,
                flags: 64
            });
        }

        // Split lyrics into chunks if too long (Discord has 2000 char limit)
        const chunks = this.splitLyrics(lyrics, 1900);
        
        for (let i = 0; i < chunks.length; i++) {
            const content = i === 0 
                ? `${emoji.karaoke.music} **${session.currentSinger.songTitle}**\n\n📜 **Lyrics:**\n\`\`\`\n${chunks[i]}\n\`\`\``
                : `\`\`\`\n${chunks[i]}\n\`\`\``;
            
            await ctx.sendMessage({
                content,
                flags: 64
            });
        }
    }

    async fetchLyrics(songTitle, songId) {
        const GENIUS_API_KEY = process.env.GENIUS_API_KEY;
        
        if (!GENIUS_API_KEY) {
            console.warn('⚠️ GENIUS_API_KEY not found in .env - lyrics feature will not work');
            return null;
        }

        try {
            // Check if we have cached lyrics in database
            const song = await Song.findOne({ songId }).catch(() => null);
            
            // Only use cached lyrics if they're actual lyrics (not just a link)
            if (song?.lyrics && !song.lyrics.includes('View full lyrics at:') && song.lyrics.length > 100) {
                console.log('✓ Using cached lyrics for:', songTitle);
                return song.lyrics;
            }

            console.log('🔍 Fetching fresh lyrics for:', songTitle);

            // Initialize Genius client
            const geniusClient = new GeniusClient(GENIUS_API_KEY);

            // Extract artist and title from songTitle
            let artist = '';
            let title = songTitle;
            
            if (songTitle.includes(' - ')) {
                const parts = songTitle.split(' - ');
                title = parts[0].trim();
                artist = parts[1]?.trim() || '';
            } else if (songTitle.includes(' by ')) {
                const parts = songTitle.split(' by ');
                title = parts[0].trim();
                artist = parts[1]?.trim() || '';
            }

            // Search for the song
            const searches = await geniusClient.songs.search(songTitle);
            
            if (!searches || searches.length === 0) {
                console.log('❌ No search results for:', songTitle);
                return null;
            }

            // Get the first result
            const firstSong = searches[0];
            console.log(`📝 Found: "${firstSong.title}" by ${firstSong.artist.name}`);

            // Fetch full lyrics
            const lyricsText = await firstSong.lyrics();
            
            if (!lyricsText || lyricsText.length < 50) {
                console.log('❌ No lyrics text available');
                return null;
            }

            console.log('✓ Successfully fetched lyrics, length:', lyricsText.length);

            // Cache the lyrics in database
            if (song) {
                song.lyrics = lyricsText;
                await song.save().catch(() => {});
                console.log('💾 Cached lyrics in database');
            }

            return lyricsText;
            
        } catch (error) {
            console.error('❌ Lyrics fetch error:', error.message);
            return null;
        }
    }

    splitLyrics(lyrics, maxLength) {
        if (lyrics.length <= maxLength) {
            return [lyrics];
        }

        const chunks = [];
        let currentChunk = '';
        const lines = lyrics.split('\n');

        for (const line of lines) {
            if ((currentChunk + line + '\n').length > maxLength) {
                if (currentChunk) {
                    chunks.push(currentChunk.trim());
                    currentChunk = '';
                }
                
                // If single line is too long, split it
                if (line.length > maxLength) {
                    chunks.push(line.substring(0, maxLength));
                    continue;
                }
            }
            currentChunk += line + '\n';
        }

        if (currentChunk) {
            chunks.push(currentChunk.trim());
        }

        return chunks;
    }
}
