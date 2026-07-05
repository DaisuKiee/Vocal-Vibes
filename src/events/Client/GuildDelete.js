import Event from '../../structures/Event.js';

export default class GuildDelete extends Event {
    constructor(...args) {
        super(...args, {
            name: 'guildDelete',
        });
    }

    async run(guild) {
        this.client.logger.log(`Left guild: ${guild.name} (${guild.id})`);
        
        // Send log to Discord channel
        if (this.client.discordLogger) {
            await this.client.discordLogger.logGuildLeave(guild);
        }
    }
}
