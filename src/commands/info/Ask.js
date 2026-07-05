import { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder } from 'discord.js';
import Command from "../../structures/Command.js";
import { ChatConversation, ChatUsage } from "../../schemas/chat.js";
import { GoogleGenerativeAI } from '@google/generative-ai';
import crypto from 'crypto';

const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

export default class Ask extends Command {
    constructor(client) {
        super(client, {
            name: 'ask',
            description: {
                content: 'Ask the Vocal Vibes AI Assistant a question',
                usage: '<question>',
                examples: ['ask How do I start a karaoke session?', 'ask What commands are available?'],
            },
            aliases: ['ai', 'assistant'],
            category: 'info',
            cooldown: 5,
            permissions: {
                dev: false,
                client: ['SendMessages', 'ViewChannel', 'EmbedLinks'],
                user: [],
            },
            slashCommand: true,
            options: [
                {
                    name: 'question',
                    description: 'Your question for the AI assistant',
                    type: 3,
                    required: true
                }
            ]
        });
    }

    async run(ctx, args) {
        const question = ctx.isInteraction 
            ? ctx.interaction.options.getString('question')
            : args.join(' ');

        if (!question) {
            return ctx.sendMessage({
                content: '❌ Please provide a question! Example: `/ask How do I start karaoke?`',
                flags: 64
            });
        }

        if (!genAI) {
            return ctx.sendMessage({
                content: '❌ AI Assistant is currently unavailable. Please try the website chat or documentation!',
                flags: 64
            });
        }

        // Check daily limit (20 messages per day per user)
        const DAILY_LIMIT = 20;
        const userId = ctx.author.id;
        const today = new Date().toISOString().split('T')[0];

        try {
            let usage = await ChatUsage.findOne({ ipAddress: userId, date: today });
            
            if (usage && usage.messageCount >= DAILY_LIMIT) {
                return ctx.sendMessage({
                    content: `❌ Daily limit reached! You can ask up to ${DAILY_LIMIT} questions per day. Please try again tomorrow.`,
                    flags: 64
                });
            }
        } catch (err) {
            console.error('Error checking daily limit:', err);
        }

        // Defer reply for processing
        await ctx.interaction?.deferReply({ flags: 64 }).catch(() => {});

        // Get or create session
        const sessionId = `discord_${userId}`;
        let conversation = null;
        let conversationHistory = [];

        try {
            conversation = await ChatConversation.findOne({ sessionId });
            if (conversation) {
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
- Keep responses under 1500 characters for Discord
- If asked about unrelated topics, politely redirect to bot-related assistance
- Include relevant command examples when helpful

IMPORTANT - Contact Information:
- If users ask to contact developers, report bugs, request features, or need direct support, ALWAYS provide the support server link: ${process.env.SUPPORT_SERVER || 'https://discord.gg/UzW4cApP7Z'}
- Make it clear you cannot DM developers or send notifications, but they can reach the team directly in the support server
- For feature requests or bug reports, encourage them to join the support server${contextMessages}

Current User Question: ${question}`;

        // Try multiple models
        const models = [
            'models/gemini-2.5-flash',
            'models/gemini-2.0-flash',
            'models/gemini-2.5-pro',
            'models/gemini-2.0-flash-lite'
        ];

        let response = null;
        let lastError = null;

        for (const modelName of models) {
            try {
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent(systemPrompt);
                response = result.response.text();
                break;
            } catch (error) {
                lastError = error;
                if (error.status === 404) continue;
                break;
            }
        }

        if (!response) {
            console.error('AI error:', lastError);
            return ctx.sendMessage({
                content: '❌ Sorry, I encountered an error. Please try again or visit our support server!',
                flags: 64
            });
        }

        // Save conversation
        try {
            if (!conversation) {
                conversation = await ChatConversation.create({
                    sessionId,
                    ipAddress: userId,
                    messages: [],
                    messageCount: 0
                });
            }

            conversation.messages.push(
                { role: 'user', content: question, timestamp: new Date() },
                { role: 'assistant', content: response, timestamp: new Date() }
            );
            conversation.messageCount += 2;
            conversation.lastMessageAt = new Date();
            await conversation.save();

            // Update daily usage
            await ChatUsage.findOneAndUpdate(
                { ipAddress: userId, date: today },
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
            const usage = await ChatUsage.findOne({ ipAddress: userId, date: today });
            remaining = DAILY_LIMIT - (usage?.messageCount || 0);
        } catch (err) {}

        // Truncate if too long for Discord
        if (response.length > 1800) {
            response = response.substring(0, 1800) + '...\n\n*Response truncated. Visit our website for full details!*';
        }

        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('# 🤖 Vocal Vibes Assistant'))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `**Your Question:**\n${question}\n\n` +
                `**Answer:**\n${response}\n\n` +
                `───────────────────\n\n` +
                `💬 **Remaining questions today:** ${remaining}/${DAILY_LIMIT}\n` +
                `🌐 **Need more help?** Visit [our website](https://vocals.filipino.gg) or join our support server!`
            ));

        return ctx.sendMessage({ components: [container], flags: 32768 | 64 });
    }
}
