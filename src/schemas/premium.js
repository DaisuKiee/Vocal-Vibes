import pkg from 'mongoose';
const { Schema, model, models } = pkg;

// Premium server schema
const premiumSchema = new Schema({
    guildId: { type: String, required: true, unique: true },
    isPremium: { type: Boolean, default: false },
    premiumTier: { type: String, enum: ['free', 'basic', 'pro'], default: 'free' },
    features: {
        aiAnnouncer: { type: Boolean, default: false },
        customAnnouncements: { type: Boolean, default: false },
        prioritySupport: { type: Boolean, default: false }
    },
    activatedAt: { type: Date },
    expiresAt: { type: Date },
    activatedBy: { type: String },
    updatedAt: { type: Date, default: Date.now }
});

export const Premium = models.Premium || model('Premium', premiumSchema);
