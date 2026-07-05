import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ChatConversation, ChatUsage } from '../schemas/chat.js';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Gemini AI
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

// List available models on startup
if (genAI) {
    (async () => {
        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1/models?key=${process.env.GEMINI_API_KEY}`
            );
            const data = await response.json();
            if (data.models) {
                console.log('📋 Available Gemini models:');
                data.models
                    .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
                    .forEach(m => console.log(`  - ${m.name}`));
            }
        } catch (e) {
            console.log('⚠️  Could not list Gemini models:', e.message);
        }
    })();
}

// Simple rate limiter for chatbot (max 10 requests per minute globally)
const chatRateLimit = {
    requests: [],
    maxRequests: 10,
    windowMs: 60000, // 1 minute
    isAllowed() {
        const now = Date.now();
        this.requests = this.requests.filter(t => now - t < this.windowMs);
        if (this.requests.length >= this.maxRequests) return false;
        this.requests.push(now);
        return true;
    }
};

// Helper to get bot data
function getBotData(client) {
    return {
        name: client.user?.username || 'Vocal Vibes',
        avatar: client.user?.displayAvatarURL({ size: 256 }) || '',
        servers: client.guilds?.cache.size || 0,
        users: client.guilds?.cache.reduce((acc, guild) => acc + guild.memberCount, 0) || 0,
        commands: client.commands?.size || 0,
        ping: Math.round(client.ws?.ping) || 0,
        inviteUrl: `https://discord.com/api/oauth2/authorize?client_id=${client.user?.id}&permissions=8&scope=bot%20applications.commands`,
        supportServer: process.env.SUPPORT_SERVER || '#'
    };
}

// Helper to format uptime
function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    parts.push(`${secs}s`);
    return parts.join(' ');
}

export function startWebServer(client) {
    const app = express();
    const PORT = process.env.WEB_PORT || 3000;

    // Set EJS as view engine
    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, 'views'));

    // Serve static files
    app.use('/static', express.static(path.join(__dirname, 'public')));
    
    // Parse JSON for API requests
    app.use(express.json());

    // Landing page route
    app.get('/', (req, res) => {
        res.render('landing', { bot: getBotData(client) });
    });

    // Sponsor page route
    app.get('/sponsor', async (req, res) => {
        const defaultSponsorId = '763746716243066890';
        let sponsor = null;
        
        try {
            const user = await client.users.fetch(defaultSponsorId);
            sponsor = {
                username: user.username,
                id: user.id,
                avatar: user.displayAvatarURL({ size: 512 }),
                createdAt: user.createdAt
            };
        } catch (e) {
            sponsor = null;
        }
        
        res.render('sponsor', { bot: getBotData(client), sponsor });
    });

    // Status page route
    app.get('/status', (req, res) => {
        const status = {
            online: client.ws?.status === 0,
            ping: Math.round(client.ws?.ping) || 0,
            uptime: formatUptime(process.uptime()),
            uptimeRaw: process.uptime(),
            servers: client.guilds?.cache.size || 0,
            users: client.guilds?.cache.reduce((acc, guild) => acc + guild.memberCount, 0) || 0,
            channels: client.channels?.cache.size || 0,
            memoryUsage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            nodeVersion: process.version,
            platform: os.platform(),
            cpuUsage: os.loadavg()[0]?.toFixed(2) || '0.00'
        };
        res.render('status', { bot: getBotData(client), status });
    });

    // Docs page route
    app.get('/docs', (req, res) => {
        res.render('docs', { bot: getBotData(client) });
    });

    // Report page route
    app.get('/report', (req, res) => {
        res.render('report', { bot: getBotData(client) });
    });

    // Commands page route
    app.get('/commands', (req, res) => {
        const commands = [];
        const categories = {};
        
        client.commands?.forEach(cmd => {
            const category = cmd.category || 'misc';
            if (!categories[category]) categories[category] = [];
            categories[category].push({
                name: cmd.name,
                description: cmd.description?.content || 'No description',
                usage: cmd.description?.usage || cmd.name,
                aliases: cmd.aliases || [],
                cooldown: cmd.cooldown || 3
            });
        });
        
        res.render('commands', { bot: getBotData(client), categories });
    });

    // Health check endpoint
    app.get('/health', (req, res) => {
        res.json({ status: 'ok', uptime: process.uptime() });
    });

    // API endpoint for bot stats
    app.get('/api/stats', (req, res) => {
        res.json({
            servers: client.guilds?.cache.size || 0,
            users: client.guilds?.cache.reduce((acc, guild) => acc + guild.memberCount, 0) || 0,
            channels: client.channels?.cache.size || 0,
            ping: Math.round(client.ws?.ping) || 0,
            memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            uptime: process.uptime()
        });
    });

    // Top.gg Webhook endpoint for vote tracking
    app.post('/api/topgg-webhook', async (req, res) => {
        const auth = req.headers.authorization;
        
        if (!process.env.TOPGG_WEBHOOK_SECRET || auth !== process.env.TOPGG_WEBHOOK_SECRET) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        
        const { user, type, bot, isWeekend } = req.body;
        
        console.log(`Top.gg: User ${user} voted for bot (weekend: ${isWeekend})`);
        
        // Log vote to Discord channel
        if (client.discordLogger) {
            const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder } = await import('discord.js');
            const voteChannel = await client.channels.fetch(process.env.LOG_VOTES_CHANNEL).catch(() => null);
            
            if (voteChannel) {
                try {
                    const voter = await client.users.fetch(user).catch(() => null);
                    
                    const container = new ContainerBuilder();
                    container.addTextDisplayComponents(
                        new TextDisplayBuilder().setContent('# 🗳️ New Top.gg Vote!')
                    );
                    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
                    container.addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `**👤 Voter:** ${voter ? `${voter.tag} (<@${user}>)` : `<@${user}>`}\n` +
                            `**🆔 User ID:** \`${user}\`\n` +
                            `**🎉 Weekend Bonus:** ${isWeekend ? 'Yes (2x)' : 'No'}`
                        )
                    );
                    container.addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`-# Thank you for voting! <t:${Math.floor(Date.now() / 1000)}:R>`)
                    );
                    
                    await voteChannel.send({ components: [container], flags: 32768 });
                } catch (err) {
                    console.error('Failed to send vote log:', err);
                }
            }
        }
        
        res.status(200).json({ success: true });
    });

    // Report API endpoint
    app.post('/api/report', async (req, res) => {
        const { type, username, server, title, description, command, error } = req.body;
        
        if (!type || !username || !title || !description) {
            return res.status(400).json({ error: 'Please fill in all required fields.' });
        }
        
        const reportChannelId = process.env.LOG_REPORTS_CHANNEL;
        if (!reportChannelId) {
            console.log('Report received but LOG_REPORTS_CHANNEL not configured');
            return res.json({ success: true, message: 'Report received' });
        }
        
        try {
            const channel = await client.channels.fetch(reportChannelId);
            if (!channel) {
                return res.json({ success: true, message: 'Report received' });
            }
            
            // Import Components V2
            const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder } = await import('discord.js');
            
            const typeEmojis = {
                bug: '🐛',
                error: '❌',
                feature: '💡',
                performance: '⚡',
                other: '📝'
            };
            
            const container = new ContainerBuilder();
            
            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`# ${typeEmojis[type] || '📝'} New ${type.charAt(0).toUpperCase() + type.slice(1)} Report`)
            );
            
            container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
            
            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `**📋 Title:** ${title}\n` +
                    `**👤 Reporter:** ${username}\n` +
                    `**🏠 Server:** ${server || 'Not specified'}`
                )
            );
            
            container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
            
            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`**📝 Description:**\n${description}`)
            );
            
            if (command) {
                container.addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`**⌨️ Command:** \`${command}\``)
                );
            }
            
            if (error) {
                container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
                container.addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`**⚠️ Error Message:**\n\`\`\`${error.slice(0, 500)}\`\`\``)
                );
            }
            
            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`-# Submitted at <t:${Math.floor(Date.now() / 1000)}:F>`)
            );
            
            await channel.send({ components: [container], flags: 32768 });
            
            res.json({ success: true, message: 'Report submitted successfully' });
        } catch (err) {
            console.error('Failed to send report:', err);
            res.json({ success: true, message: 'Report received' });
        }
    });

    // Chatbot API endpoint using Gemini
    app.post('/api/chat', async (req, res) => {
        const { message, sessionId } = req.body;
        
        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }
        
        if (!genAI) {
            return res.status(503).json({ 
                error: 'AI chat is currently unavailable. Please contact support for help!' 
            });
        }
        
        // Get user IP
        const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        
        // Check daily limit (20 messages per day per IP)
        const DAILY_LIMIT = 20;
        try {
            let usage = await ChatUsage.findOne({ ipAddress, date: today });
            
            if (usage && usage.messageCount >= DAILY_LIMIT) {
                return res.status(429).json({ 
                    error: `Daily limit reached! You can send up to ${DAILY_LIMIT} messages per day. Please try again tomorrow.`,
                    limit: DAILY_LIMIT,
                    used: usage.messageCount
                });
            }
        } catch (err) {
            console.error('Error checking daily limit:', err);
        }
        
        // Check rate limit before calling API
        if (!chatRateLimit.isAllowed()) {
            return res.status(429).json({ 
                error: 'Too many messages! Please wait a moment before sending another.' 
            });
        }
        
        // Get or create session
        const userSessionId = sessionId || crypto.randomUUID();
        let conversation = null;
        let conversationHistory = [];
        
        try {
            conversation = await ChatConversation.findOne({ sessionId: userSessionId });
            if (conversation) {
                // Get last 10 messages for context
                conversationHistory = conversation.messages.slice(-10);
            }
        } catch (err) {
            console.error('Error loading conversation:', err);
        }
        
        // Build conversation context
        let contextMessages = '';
        if (conversationHistory.length > 0) {
            contextMessages = '\n\nPrevious conversation:\n' + 
                conversationHistory.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n');
        }
        
        const systemPrompt = `You are the Vocal Vibes Assistant, a professional AI helper for the Vocal Vibes Discord karaoke bot.

About Vocal Vibes:
Vocal Vibes is a comprehensive Discord bot designed for hosting professional karaoke sessions in Discord servers.

Key Features:
- Queue Management: Organized singer lineup with position tracking
- Auto-Mute System: Automatically mutes audience members and unmutes singers when it's their turn
- Song Catalog: Extensive searchable database of karaoke songs
- Event Manager Controls: Dedicated role with session management permissions
- Sticky Messages: Real-time queue updates in the karaoke channel

Main Commands:
- /karaoke-setup: Configure karaoke system (Admin only)
- /karaoke start: Begin a karaoke session (Event Manager)
- /karaoke stop: End the current session (Event Manager)
- /queue add: Join the singing queue
- /queue view: Display current queue
- /songs: Browse the song catalog
- /mute: Manage voice channel muting

How It Works:
1. Server administrators configure channels and roles using /karaoke-setup
2. Event Managers start sessions with /karaoke start
3. Users browse songs and join the queue
4. The bot automatically manages voice permissions
5. Singers are unmuted when it's their turn to perform

Communication Style:
- Be professional, clear, and helpful
- Use proper grammar and formatting
- Provide accurate, concise information
- If asked about unrelated topics, politely redirect to bot-related assistance
- Include relevant command examples when helpful

IMPORTANT - Contact Information:
- If users ask to contact developers, report bugs, request features, or need direct support, ALWAYS provide the support server link: ${process.env.SUPPORT_SERVER || 'https://discord.gg/UzW4cApP7Z'}
- Make it clear you cannot DM developers or send notifications, but they can reach the team directly in the support server
- For feature requests or bug reports, encourage them to join the support server${contextMessages}

Current User Question: ${message}`;

        // Try multiple models in order of preference
        const models = [
            'models/gemini-2.5-flash',
            'models/gemini-2.0-flash',
            'models/gemini-2.5-pro',
            'models/gemini-2.0-flash-lite',
            'gemini-2.5-flash',
            'gemini-2.0-flash'
        ];

        let lastError = null;
        let response = null;
        
        for (const modelName of models) {
            try {
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent(systemPrompt);
                response = result.response.text();
                console.log(`✓ Using Gemini model: ${modelName}`);
                break;
            } catch (error) {
                lastError = error;
                if (error.status === 404) {
                    console.log(`✗ Model ${modelName} not available, trying next...`);
                    continue; // Try next model
                }
                // If it's not a 404, break and handle the error
                break;
            }
        }
        
        // Handle errors
        if (!response) {
            console.error('All Gemini models failed. Last error:', lastError);
            
            if (lastError?.status === 429 || lastError?.message?.includes('429')) {
                return res.status(429).json({ 
                    error: 'AI is busy right now. Please wait about 1 minute and try again.' 
                });
            }
            
            if (lastError?.status === 400 || lastError?.message?.includes('API key')) {
                return res.status(503).json({ 
                    error: 'AI chat is temporarily unavailable. Please check the API key or try the documentation!' 
                });
            }
            
            return res.status(500).json({ 
                error: 'Sorry, I encountered an error. Please try again or visit our support server!' 
            });
        }
        
        // Save conversation to database
        try {
            if (!conversation) {
                conversation = await ChatConversation.create({
                    sessionId: userSessionId,
                    ipAddress,
                    messages: [],
                    messageCount: 0
                });
            }
            
            // Add user message and assistant response
            conversation.messages.push(
                { role: 'user', content: message, timestamp: new Date() },
                { role: 'assistant', content: response, timestamp: new Date() }
            );
            conversation.messageCount += 2;
            conversation.lastMessageAt = new Date();
            await conversation.save();
            
            // Update daily usage
            await ChatUsage.findOneAndUpdate(
                { ipAddress, date: today },
                { 
                    $inc: { messageCount: 1 },
                    $set: { lastMessageAt: new Date() }
                },
                { upsert: true }
            );
            
        } catch (err) {
            console.error('Error saving conversation:', err);
        }
        
        // Get remaining messages
        let remaining = DAILY_LIMIT;
        try {
            const usage = await ChatUsage.findOne({ ipAddress, date: today });
            remaining = DAILY_LIMIT - (usage?.messageCount || 0);
        } catch (err) {}
        
        return res.json({ 
            response,
            sessionId: userSessionId,
            remainingMessages: remaining
        });
    });

    // 404 handler - must be last
    app.use((req, res) => {
        res.status(404).render('404', { bot: getBotData(client) });
    });

    app.listen(PORT, () => {
        console.log(`🌐 Web server running on http://localhost:${PORT}`);
    });

    return app;
}
