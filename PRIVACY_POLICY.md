# Privacy Policy for Vocal Vibes

**Last Updated:** January 7, 2025

## Introduction

Vocal Vibes ("the Bot") is a Discord karaoke bot that helps users organize and manage karaoke sessions. This Privacy Policy explains what data we collect, how we use it, and your rights regarding your data.

## Data We Collect

### Server Data
- **Server ID**: To identify which server the bot is operating in
- **Channel IDs**: Text and voice channels configured for karaoke sessions
- **Role IDs**: Event Manager roles designated for session management

### User Data
- **User ID**: Discord user identifier for queue management
- **Username**: Display name for queue position displays
- **Voice State**: Current voice channel connection status for muting/unmuting

### Karaoke Session Data
- **Queue Information**: User positions, join timestamps, and song selections (in automatic mode)
- **Session Status**: Active sessions, current singers, and queue state
- **Settings**: Server-specific configuration (command mode, sticky message preferences)

## How We Use Your Data

We use the collected data solely for:
- Managing karaoke queue positions and order
- Muting and unmuting participants during karaoke sessions
- Displaying queue information to users
- Enforcing Event Manager permissions
- Maintaining session state and configuration

## Data Storage

- All data is stored securely in a MongoDB database
- Data is retained only while a karaoke session is active or until explicitly cleared
- Server configuration data persists to maintain your settings across sessions

## Data Sharing

We do NOT:
- Share your data with third parties
- Sell your data to advertisers
- Use your data for purposes other than bot functionality
- Access your messages beyond command processing (prefix commands only)

## Third-Party Services

The bot may use:
- **Genius API**: For fetching song lyrics (only song titles are sent, no user data)
- **MongoDB**: For data storage (encrypted and secure)

## Your Rights

You have the right to:
- Request deletion of your server's data by removing the bot
- Clear queue data at any time using `/karaoke stop` or `!clearqueue`
- View what data is stored using queue display commands
- Opt-out by not using the bot

## Data Retention

- **Queue Data**: Automatically cleared when session ends
- **Configuration Data**: Retained until bot is removed from server
- **User Queue Entries**: Cleared when user leaves queue or session ends

## Privileged Gateway Intents

The bot requires the following intents:

### Server Members Intent
Used for fetching member information to manage voice state (muting/unmuting) and verify role permissions.

### Message Content Intent
Used for processing prefix commands (!joinqueue, !nextqueue, etc.) in Manual mode and maintaining sticky message functionality.

### Presence Intent (Optional)
Used for displaying user online/offline status in queue displays.

## Children's Privacy

The bot does not knowingly collect data from users under 13. Discord's Terms of Service require users to be 13 or older.

## Changes to This Policy

We may update this Privacy Policy from time to time. Continued use of the bot after changes constitutes acceptance of the updated policy.

## Contact

For privacy concerns or data deletion requests:
- GitHub: https://github.com/DaisuKiee/Vocal-Vibes
- Support Server: [Your Discord Server Invite]

## Data Deletion

To request complete data deletion:
1. Remove the bot from your server, OR
2. Use `/karaoke reset` to clear all configuration data, OR
3. Contact us via GitHub

All associated data will be permanently deleted.

---

By using Vocal Vibes, you agree to this Privacy Policy.
