import pkg from 'mongoose';
const { Schema, model, models } = pkg;

// Server karaoke settings schema
const karaokeSettingsSchema = new Schema({
    guildId: { type: String, required: true, unique: true },
    isConfigured: { type: Boolean, default: false }, // Must be true to use karaoke
    karaokeChannelId: { type: String, default: null }, // Text channel for karaoke
    voiceChannelId: { type: String, default: null }, // Voice channel for karaoke
    eventManagerRoleId: { type: String, default: null }, // Event manager/staff role
    djRoleId: { type: String, default: null }, // DJ role (alias for event manager)
    stickyMessageId: { type: String, default: null },
    stickyChannelId: { type: String, default: null },
    stickyEnabled: { type: Boolean, default: true },
    stickyMode: { type: String, enum: ['sticky', 'delay'], default: 'sticky' }, // sticky = always on top, delay = resend after X seconds
    stickyDelay: { type: Number, default: 30 }, // Delay in seconds for delay mode
    requireDjRole: { type: Boolean, default: true }, // Require role to manage
    autoMuteEnabled: { type: Boolean, default: true }, // Auto-mute audience in VC
    commandMode: { type: String, enum: ['automatic', 'manual'], default: 'automatic' }, // automatic = slash commands, manual = prefix commands
    updatedAt: { type: Date, default: Date.now }
});

// Song catalog schema
const songSchema = new Schema({
    songId: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    artist: { type: String, required: true },
    genre: { type: String, default: 'Unknown' },
    language: { type: String, default: 'English' },
    duration: { type: Number, default: 0 },
    difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'], default: 'Medium' },
    lyrics: { type: String, default: null }, // Song lyrics
    addedBy: { type: String },
    createdAt: { type: Date, default: Date.now }
});

// Queue schema for active karaoke sessions
const queueSchema = new Schema({
    guildId: { type: String, required: true },
    channelId: { type: String, required: true },
    voiceChannelId: { type: String },
    isActive: { type: Boolean, default: true },
    isLocked: { type: Boolean, default: false }, // Lock queue - prevent new entries
    currentSinger: {
        userId: String,
        username: String,
        songId: String,
        songTitle: String,
        lyrics: String, // Song lyrics for display
        startedAt: Date
    },
    lastSinger: {
        userId: String,
        username: String,
        songId: String,
        songTitle: String,
        finishedAt: Date
    },
    queue: [{
        userId: { type: String, required: true },
        username: { type: String, required: true },
        songId: { type: String, required: true },
        songTitle: { type: String, required: true },
        addedAt: { type: Date, default: Date.now }
    }],
    settings: {
        maxQueuePerUser: { type: Number, default: 2 },
        autoMuteAudience: { type: Boolean, default: true },
        allowRatings: { type: Boolean, default: true }
    },
    fullQueueCooldown: { type: Date, default: null }, // Global cooldown for Full Queue button
    queueResendCooldown: { type: Date, default: null }, // 10-second cooldown for queue resend
    createdAt: { type: Date, default: Date.now }
});

// Rating schema for performances
const ratingSchema = new Schema({
    guildId: { type: String, required: true },
    singerId: { type: String, required: true },
    singerUsername: { type: String, required: true },
    songId: { type: String, required: true },
    songTitle: { type: String, required: true },
    ratings: [{
        oderId: String,
        odername: String,
        score: { type: Number, min: 1, max: 5 },
        comment: String,
        ratedAt: { type: Date, default: Date.now }
    }],
    averageRating: { type: Number, default: 0 },
    performedAt: { type: Date, default: Date.now }
});

export const Song = models.Song || model('Song', songSchema);
export const KaraokeQueue = models.KaraokeQueue || model('KaraokeQueue', queueSchema);
export const Rating = models.Rating || model('Rating', ratingSchema);
export const KaraokeSettings = models.KaraokeSettings || model('KaraokeSettings', karaokeSettingsSchema);
