import Event from '../../structures/Event.js';

export default class GuildCreate extends Event {
    constructor(...args) {
        super(...args, {
            name: 'guildCreate',
        });
    }

    async run(guild) {
        this.client.logger.log(`Joined new guild: ${guild.name} (${guild.id}) - ${guild.memberCount} members`);
        
        // Send log to Discord channel
        if (this.client.discordLogger) {
            await this.client.discordLogger.logGuildJoin(guild);
        }
    }
}
