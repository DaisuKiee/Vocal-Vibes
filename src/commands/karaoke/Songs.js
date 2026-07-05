import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder } from 'discord.js';
import Command from "../../structures/Command.js";
import { Song, KaraokeQueue } from "../../schemas/karaoke.js";
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const emoji = require("../../data/emoji.json");

export default class Songs extends Command {
    constructor(client) {
        super(client, {
            name: 'songs',
            description: {
                content: 'Browse the karaoke songbook or search online',
                usage: '[letter]',
                examples: ['songs', 'songs A', 'songs search love', 'songs online bohemian rhapsody'],
            },
            aliases: ['songbook', 'catalog', 'book'],
            category: 'karaoke',
            cooldown: 3,
            permissions: {
                dev: false,
                client: ['SendMessages', 'ViewChannel', 'EmbedLinks'],
                user: [],
            },
            slashCommand: true,
            options: [
                {
                    name: 'browse',
                    description: 'Browse songs by letter (A-Z)',
                    type: 1,
                    options: [
                        {
                            name: 'letter',
                            description: 'Starting letter (A-Z, or # for numbers)',
                            type: 3,
                            required: false
                        },
                        {
                            name: 'page',
                            description: 'Page number',
                            type: 4,
                            required: false
                        }
                    ]
                },
                {
                    name: 'search',
                    description: 'Search for a song in your songbook',
                    type: 1,
                    options: [
                        {
                            name: 'query',
                            description: 'Song title or artist to search',
                            type: 3,
                            required: true
                        }
                    ]
                },
                {
                    name: 'online',
                    description: '🌐 Search songs from the internet (iTunes)',
                    type: 1,
                    options: [
                        {
                            name: 'query',
                            description: 'Song title or artist to search online',
                            type: 3,
                            required: true
                        }
                    ]
                },
                {
                    name: 'add',
                    description: 'Add a new song to the catalog',
                    type: 1,
                    options: [
                        {
                            name: 'title',
                            description: 'Song title',
                            type: 3,
                            required: true
                        },
                        {
                            name: 'artist',
                            description: 'Artist name',
                            type: 3,
                            required: true
                        }
                    ]
                }
            ]
        });
    }

    async run(ctx, args) {
        const subcommand = ctx.isInteraction 
            ? ctx.interaction.options.getSubcommand() 
            : (args[0] === 'search' || args[0] === 'add' || args[0] === 'online') ? args[0] : 'browse';

        switch (subcommand) {
            case 'browse':
                return this.browseSongbook(ctx, args);
            case 'search':
                return this.searchSongs(ctx, args);
            case 'online':
                return this.searchOnline(ctx, args);
            case 'add':
                return this.addSong(ctx, args);
            default:
                return this.browseSongbook(ctx, args);
        }
    }

    async browseSongbook(ctx, args) {
        let letter = ctx.isInteraction 
            ? ctx.interaction.options.getString('letter')?.toUpperCase() 
            : args[0]?.toUpperCase();
        
        const page = (ctx.isInteraction ? ctx.interaction.options.getInteger('page') : parseInt(args[1])) || 1;
        const perPage = 10;

        // Default to 'A' if no letter specified
        if (!letter || letter.length !== 1) letter = 'A';
        
        // Handle # for numbers/special chars
        const isNumber = letter === '#';
        
        // Build query for songs starting with this letter
        let query;
        if (isNumber) {
            query = { title: { $regex: '^[0-9]', $options: 'i' } };
        } else if (/[A-Z]/.test(letter)) {
            query = { title: { $regex: `^${letter}`, $options: 'i' } };
        } else {
            letter = 'A';
            query = { title: { $regex: '^A', $options: 'i' } };
        }

        const totalSongs = await Song.countDocuments(query).catch(() => 0);
        const totalPages = Math.ceil(totalSongs / perPage) || 1;
        const currentPage = Math.min(Math.max(1, page), totalPages);

        const songs = await Song.find(query)
            .sort({ title: 1 })
            .skip((currentPage - 1) * perPage)
            .limit(perPage)
            .catch(() => []);

        // Build letter navigation buttons (A-Z)
        const letterRow1 = new ActionRowBuilder().addComponents(
            ...['A', 'B', 'C', 'D', 'E'].map(l => 
                new ButtonBuilder()
                    .setCustomId(`songbook_${l}_1`)
                    .setLabel(l)
                    .setStyle(l === letter ? ButtonStyle.Primary : ButtonStyle.Secondary)
            )
        );
        
        const letterRow2 = new ActionRowBuilder().addComponents(
            ...['F', 'G', 'H', 'I', 'J'].map(l => 
                new ButtonBuilder()
                    .setCustomId(`songbook_${l}_1`)
                    .setLabel(l)
                    .setStyle(l === letter ? ButtonStyle.Primary : ButtonStyle.Secondary)
            )
        );

        // Build song list content
        let content = '';
        if (songs.length === 0) {
            content = `No songs starting with **${letter}**\n\nTry \`/songs online <query>\` to search the internet!`;
        } else {
            content = songs.map((s, i) => {
                const num = String((currentPage - 1) * perPage + i + 1).padStart(3, '0');
                return `\`${num}\` **${s.title}**\n       *${s.artist}*`;
            }).join('\n\n');
            
            content += `\n\n📄 Page ${currentPage}/${totalPages} • ${totalSongs} songs`;
        }

        // Page navigation with search modal buttons
        const pageRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`songbook_page_${letter}_${currentPage - 1}`)
                .setLabel('◀ Prev')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(currentPage <= 1),
            new ButtonBuilder()
                .setCustomId(`songbook_page_${letter}_${currentPage + 1}`)
                .setLabel('Next ▶')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(currentPage >= totalPages),
            new ButtonBuilder()
                .setCustomId('songbook_search_modal')
                .setLabel('🔍 Search Song')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('songbook_online_modal')
                .setLabel('🌐 Search Online')
                .setStyle(ButtonStyle.Primary)
        );

        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 📖 Songbook - ${isNumber ? '#' : letter}`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
            .addActionRowComponents(letterRow1)
            .addActionRowComponents(letterRow2)
            .addActionRowComponents(pageRow);

        // Ephemeral - only visible to user who used the command
        return ctx.sendMessage({ components: [container], flags: 32768 | 64 });
    }

    async searchSongs(ctx, args) {
        const query = ctx.isInteraction 
            ? ctx.interaction.options.getString('query') 
            : args.slice(1).join(' ');

        if (!query) {
            return ctx.sendMessage({ content: '❌ Please provide a search query!', flags: 64 });
        }

        const songs = await Song.find({
            $or: [
                { title: { $regex: query, $options: 'i' } },
                { artist: { $regex: query, $options: 'i' } }
            ]
        }).sort({ title: 1 }).limit(15).catch(() => []);

        if (songs.length === 0) {
            // Offer to search online instead
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`online_search_${encodeURIComponent(query).substring(0, 80)}`)
                    .setLabel('🌐 Search Online Instead')
                    .setStyle(ButtonStyle.Primary)
            );

            const container = new ContainerBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent('# 🔍 Search Results'))
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `No songs found for "**${query}**" in your songbook.\n\n` +
                    `Click below to search the internet!`
                ))
                .addActionRowComponents(row);

            return ctx.sendMessage({ components: [container], flags: 32768 });
        }

        // Create select menu for song selection
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('song_select_queue')
            .setPlaceholder('🎤 Select a song to join the queue...')
            .addOptions(songs.slice(0, 25).map(s => ({
                label: s.title.substring(0, 100),
                description: s.artist.substring(0, 100),
                value: s.songId
            })));

        const row = new ActionRowBuilder().addComponents(selectMenu);

        const songList = songs.slice(0, 10).map((s, i) => {
            return `${i + 1}. **${s.title}**\n   *${s.artist}*`;
        }).join('\n\n');

        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🔍 Search: "${query}"`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `Found **${songs.length}** result(s):\n\n${songList}${songs.length > 10 ? `\n\n... and ${songs.length - 10} more in dropdown` : ''}`
            ))
            .addActionRowComponents(row);

        return ctx.sendMessage({ components: [container], flags: 32768 | 64 });
    }

    async searchOnline(ctx, args) {
        const query = ctx.isInteraction 
            ? ctx.interaction.options.getString('query') 
            : args.slice(1).join(' ');

        if (!query) {
            return ctx.sendMessage({ content: '❌ Please provide a search query!', flags: 64 });
        }

        // Defer reply for API call
        await ctx.sendDeferMessage('🌐 Searching the internet...');

        let results = [];

        // Wrap entire API logic in try-catch to prevent crashes
        const fetchWithTimeout = async (url, timeout = 8000) => {
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

        // Try Deezer first (more reliable on Windows)
        try {
            const deezerUrl = `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=20`;
            const response = await fetchWithTimeout(deezerUrl);
            const data = await response.json();
            
            if (data.data?.length > 0) {
                const seen = new Set();
                for (const track of data.data) {
                    const key = `${track.title?.toLowerCase()}-${track.artist?.name?.toLowerCase()}`;
                    if (!seen.has(key) && track.title && track.artist?.name) {
                        seen.add(key);
                        results.push({
                            title: track.title,
                            artist: track.artist.name,
                            genre: 'Music',
                            duration: track.duration || 0
                        });
                    }
                    if (results.length >= 15) break;
                }
            }
        } catch (err) {
            console.error('Deezer API error:', err.message);
        }

        // Fallback to iTunes if Deezer failed
        if (results.length === 0) {
            try {
                const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=20`;
                const response = await fetchWithTimeout(itunesUrl);
                const data = await response.json();
                
                if (data.results?.length > 0) {
                    const seen = new Set();
                    for (const track of data.results) {
                        const key = `${track.trackName?.toLowerCase()}-${track.artistName?.toLowerCase()}`;
                        if (!seen.has(key) && track.trackName && track.artistName) {
                            seen.add(key);
                            results.push({
                                title: track.trackName,
                                artist: track.artistName,
                                genre: track.primaryGenreName || 'Unknown',
                                duration: Math.floor((track.trackTimeMillis || 0) / 1000)
                            });
                        }
                        if (results.length >= 15) break;
                    }
                }
            } catch (err) {
                console.error('iTunes API error:', err.message);
            }
        }

        // If both APIs failed, show manual add option
        if (results.length === 0) {
            const container = new ContainerBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent('# ❌ Search Unavailable'))
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `Could not search online for "**${query}**".\n\n` +
                    `**Add songs manually instead:**\n` +
                    `\`/songs add <title> <artist>\`\n\n` +
                    `**Example:**\n` +
                    `\`/songs add Bohemian Rhapsody Queen\``
                ));
            return ctx.editMessage({ content: '', components: [container], flags: 32768 });
        }

        // Create select menu with unique index-based values
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('online_song_add')
            .setPlaceholder('➕ Select a song to add to songbook...')
            .addOptions(results.map((s, i) => ({
                label: s.title.substring(0, 100),
                description: `${s.artist} • ${s.genre}`.substring(0, 100),
                value: `${i}_${s.title.substring(0, 30)}_${s.artist.substring(0, 30)}_${s.genre.substring(0, 15)}`.substring(0, 100)
            })));

        const row = new ActionRowBuilder().addComponents(selectMenu);

        const songList = results.slice(0, 10).map((s, i) => {
            const duration = s.duration ? `${Math.floor(s.duration / 60)}:${(s.duration % 60).toString().padStart(2, '0')}` : '';
            return `${i + 1}. **${s.title}**\n   *${s.artist}* ${duration ? `• ${duration}` : ''}`;
        }).join('\n\n');

        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🌐 Online Search: "${query}"`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `Found **${results.length}** songs online:\n\n${songList}\n\n` +
                `*Select a song to add it to your songbook*`
            ))
            .addActionRowComponents(row);

        return ctx.editMessage({ content: '', components: [container], flags: 32768 });
    }

    async addSong(ctx, args) {
        const title = ctx.isInteraction ? ctx.interaction.options.getString('title') : args[1];
        const artist = ctx.isInteraction ? ctx.interaction.options.getString('artist') : args[2];

        if (!title || !artist) {
            return ctx.sendMessage({
                content: '❌ Please provide both title and artist!\nUsage: `/songs add <title> <artist>`',
                flags: 64
            });
        }

        const existing = await Song.findOne({
            title: { $regex: `^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
            artist: { $regex: `^${artist.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' }
        }).catch(() => null);

        if (existing) {
            return ctx.sendMessage({
                content: `❌ This song already exists! ID: \`${existing.songId}\``,
                flags: 64
            });
        }

        const songId = `${title.substring(0, 3).toUpperCase()}${artist.substring(0, 3).toUpperCase()}${Date.now().toString(36).slice(-4)}`.replace(/\s/g, '');

        const song = await Song.create({
            songId,
            title,
            artist,
            addedBy: ctx.author.id
        }).catch(() => null);

        if (!song) {
            return ctx.sendMessage({ content: '❌ Failed to add song. Database may be unavailable.', flags: 64 });
        }

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`queue_add_${song.songId}`)
                .setLabel('🎤 Sing This Song')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('songbook_online')
                .setLabel('🌐 Add More')
                .setStyle(ButtonStyle.Primary)
        );

        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('# ✅ Song Added!'))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `**${song.title}** by **${song.artist}**\n\n` +
                `🆔 ID: \`${song.songId}\`\n` +
                `👤 Added by: <@${ctx.author.id}>`
            ))
            .addActionRowComponents(row);

        return ctx.sendMessage({ components: [container], flags: 32768 });
    }
}
