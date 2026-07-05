import { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import Command from "../../structures/Command.js";
import { Song } from "../../schemas/karaoke.js";
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const emoji = require("../../data/emoji.json");

export default class SeedSongs extends Command {
    constructor(client) {
        super(client, {
            name: 'seed-songs',
            description: {
                content: 'Populate the global song catalog with 300+ popular songs (Developer only)',
                usage: '<confirm|clear>',
                examples: ['seed-songs confirm', 'seed-songs clear'],
            },
            aliases: ['loadsongs', 'populatesongs', 'seedsongs'],
            category: 'dev',
            cooldown: 120,
            permissions: {
                dev: true,
                client: ['SendMessages', 'ViewChannel', 'EmbedLinks'],
                user: [],
            },
            slashCommand: true,
            options: [
                {
                    name: 'confirm',
                    description: 'Fetch and load 300+ popular songs from the internet',
                    type: 1
                },
                {
                    name: 'clear',
                    description: 'Clear all songs and reload fresh from internet',
                    type: 1
                }
            ]
        });
    }

    async run(ctx, args) {
        const subcommand = ctx.isInteraction ? ctx.interaction.options.getSubcommand() : args[0]?.toLowerCase();

        if (subcommand === 'clear') {
            return this.clearAndSeed(ctx);
        }
        return this.seedSongs(ctx);
    }

    async seedSongs(ctx) {
        const existingCount = await Song.countDocuments().catch(() => 0);
        
        if (existingCount > 0) {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('seed_songs_clear')
                    .setLabel('🗑️ Clear & Reload')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('seed_songs_add')
                    .setLabel('➕ Add More Songs')
                    .setStyle(ButtonStyle.Primary)
            );

            const container = new ContainerBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent('# ⚠️ Songs Already Exist'))
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `There are already **${existingCount}** songs in the catalog.\n\n` +
                    `• **Clear & Reload** - Delete all and fetch fresh 300+ songs\n` +
                    `• **Add More Songs** - Keep existing and add more popular songs`
                ))
                .addActionRowComponents(row);

            return ctx.sendMessage({ components: [container], flags: 32768 });
        }

        return this.loadSongsFromInternet(ctx, false);
    }

    async clearAndSeed(ctx) {
        await Song.deleteMany({}).catch(() => {});
        return this.loadSongsFromInternet(ctx, false);
    }

    async loadSongsFromInternet(ctx, addOnly = false) {
        await ctx.sendDeferMessage('🌐 Fetching 300+ popular songs from the internet... This may take a moment.');

        const fetchWithTimeout = async (url, timeout = 10000) => {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), timeout);
            try {
                const res = await fetch(url, { 
                    signal: controller.signal,
                    headers: { 'Accept': 'application/json', 'User-Agent': 'KaraokeBot/1.0' }
                });
                clearTimeout(id);
                return res;
            } catch (e) {
                clearTimeout(id);
                throw e;
            }
        };

        const allSongs = new Map(); // Use Map to avoid duplicates

        // Search queries for popular songs A-Z
        const searchQueries = [
            // Popular artists A-Z
            'Adele', 'ABBA', 'Ariana Grande', 'Beyonce', 'Bruno Mars', 'Beatles',
            'Coldplay', 'Celine Dion', 'Drake', 'Dua Lipa', 'Ed Sheeran', 'Elton John',
            'Frank Sinatra', 'Fleetwood Mac', 'Green Day', 'Guns N Roses',
            'Harry Styles', 'Imagine Dragons', 'Justin Bieber', 'Journey',
            'Katy Perry', 'Lady Gaga', 'Linkin Park', 'Maroon 5', 'Michael Jackson',
            'Nirvana', 'One Direction', 'Pink', 'Queen', 'Rihanna',
            'Shakira', 'Taylor Swift', 'U2', 'Usher', 'Whitney Houston',
            'Weeknd', 'XXXTENTACION', 'Zayn',
            // Popular song keywords
            'love song karaoke', 'pop hits', 'rock classics', 'dance hits',
            '80s hits', '90s hits', '2000s hits', 'wedding songs', 'party songs',
            'ballad', 'duet songs', 'country hits', 'r&b classics'
        ];

        let totalFetched = 0;

        for (const query of searchQueries) {
            if (allSongs.size >= 350) break; // Stop when we have enough

            try {
                // Try Deezer API
                const deezerUrl = `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=25`;
                const response = await fetchWithTimeout(deezerUrl);
                const data = await response.json();
                
                if (data.data?.length > 0) {
                    for (const track of data.data) {
                        if (allSongs.size >= 350) break;
                        
                        const key = `${track.title?.toLowerCase()}-${track.artist?.name?.toLowerCase()}`;
                        if (!allSongs.has(key) && track.title && track.artist?.name) {
                            allSongs.set(key, {
                                title: track.title,
                                artist: track.artist.name,
                                genre: 'Pop',
                                duration: track.duration || 0
                            });
                            totalFetched++;
                        }
                    }
                }
                
                // Small delay to avoid rate limiting
                await new Promise(r => setTimeout(r, 100));
            } catch (err) {
                console.error(`Failed to fetch for "${query}":`, err.message);
            }
        }

        // If we don't have enough, try iTunes as backup
        if (allSongs.size < 300) {
            const backupQueries = ['top songs 2024', 'best karaoke songs', 'classic rock', 'pop music', 'hip hop hits'];
            
            for (const query of backupQueries) {
                if (allSongs.size >= 350) break;
                
                try {
                    const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=50`;
                    const response = await fetchWithTimeout(itunesUrl);
                    const data = await response.json();
                    
                    if (data.results?.length > 0) {
                        for (const track of data.results) {
                            if (allSongs.size >= 350) break;
                            
                            const key = `${track.trackName?.toLowerCase()}-${track.artistName?.toLowerCase()}`;
                            if (!allSongs.has(key) && track.trackName && track.artistName) {
                                allSongs.set(key, {
                                    title: track.trackName,
                                    artist: track.artistName,
                                    genre: track.primaryGenreName || 'Pop',
                                    duration: Math.floor((track.trackTimeMillis || 0) / 1000)
                                });
                            }
                        }
                    }
                    
                    await new Promise(r => setTimeout(r, 100));
                } catch (err) {
                    console.error(`iTunes backup failed for "${query}":`, err.message);
                }
            }
        }

        // Sort songs alphabetically by title
        const sortedSongs = Array.from(allSongs.values()).sort((a, b) => 
            a.title.localeCompare(b.title)
        );

        // Save to database
        let added = 0;
        let failed = 0;
        const existingSongs = addOnly ? await Song.find({}, 'title artist').lean().catch(() => []) : [];
        const existingKeys = new Set(existingSongs.map(s => `${s.title?.toLowerCase()}-${s.artist?.toLowerCase()}`));

        for (let i = 0; i < sortedSongs.length; i++) {
            const song = sortedSongs[i];
            const key = `${song.title.toLowerCase()}-${song.artist.toLowerCase()}`;
            
            if (addOnly && existingKeys.has(key)) continue;

            try {
                const songId = `${song.title.substring(0, 3).toUpperCase()}${song.artist.substring(0, 3).toUpperCase()}${Date.now().toString(36).slice(-4)}${i}`.replace(/\s/g, '');
                
                await Song.create({
                    songId,
                    title: song.title,
                    artist: song.artist,
                    genre: song.genre || 'Pop',
                    difficulty: 'Medium',
                    language: 'English',
                    duration: song.duration || 0,
                    addedBy: 'system'
                });
                added++;
            } catch (e) {
                failed++;
            }
        }

        // Count songs by first letter
        const letterCounts = {};
        for (const song of sortedSongs) {
            const firstLetter = song.title.charAt(0).toUpperCase();
            if (/[A-Z]/.test(firstLetter)) {
                letterCounts[firstLetter] = (letterCounts[firstLetter] || 0) + 1;
            } else {
                letterCounts['#'] = (letterCounts['#'] || 0) + 1;
            }
        }

        const letterList = Object.entries(letterCounts)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .slice(0, 10)
            .map(([letter, count]) => `${letter}: ${count}`)
            .join(' • ');

        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('# ✅ Song Catalog Loaded!'))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `🌐 Fetched **${sortedSongs.length}** songs from the internet!\n` +
                `✅ Successfully added **${added}** songs to catalog\n` +
                `${failed > 0 ? `⚠️ ${failed} songs failed to save\n` : ''}\n` +
                `**Songs by Letter (sample):**\n${letterList}...\n\n` +
                `Use \`/songs\` to browse the catalog!`
            ));

        return ctx.editMessage({ content: '', components: [container], flags: 32768 });
    }
}
