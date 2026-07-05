import pkg from 'mongoose';
const { Schema, model, models } = pkg;

// Chat conversation schema
const chatConversationSchema = new Schema({
    sessionId: { type: String, required: true, unique: true },
    ipAddress: { type: String, required: true },
    messages: [{
        role: { type: String, enum: ['user', 'assistant'], required: true },
        content: { type: String, required: true },
        timestamp: { type: Date, default: Date.now }
    }],
    messageCount: { type: Number, default: 0 },
    lastMessageAt: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now }
});

// Daily usage tracking schema
const chatUsageSchema = new Schema({
    ipAddress: { type: String, required: true },
    date: { type: String, required: true }, // Format: YYYY-MM-DD
    messageCount: { type: Number, default: 0 },
    lastMessageAt: { type: Date, default: Date.now }
});

// Create compound index for efficient queries
chatUsageSchema.index({ ipAddress: 1, date: 1 }, { unique: true });

export const ChatConversation = models.ChatConversation || model('ChatConversation', chatConversationSchema);
export const ChatUsage = models.ChatUsage || model('ChatUsage', chatUsageSchema);
