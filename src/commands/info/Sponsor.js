import Command from "../../structures/Command.js";
import { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder } from "discord.js";
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const emoji = require("../../data/emoji.json");

export default class Sponsor extends Command {
    constructor(client) {
        super(client, {
            name: 'sponsor',
            description: {
                content: 'View information about our amazing sponsor',
                usage: 'sponsor',
                examples: ['sponsor'],
            },
            aliases: ["sponsors", "supporter"],
            category: 'info',
            cooldown: 3,
            permissions: {
                dev: false,
                client: ['SendMessages', 'ViewChannel', 'EmbedLinks'],
                user: [],
            },
            slashCommand: true,
            options: [
                {
                    name: 'user',
                    description: 'View a specific sponsor by user ID',
                    type: 3,
                    required: false
                }
            ]
        });
    }

    async run(ctx, args) {
        // Get sponsor user ID from args or use default sponsor
        const sponsorId = ctx.isInteraction 
            ? ctx.interaction.options.getString('user') 
            : args[0];

        // Default sponsor ID - you can change this to your actual sponsor's ID
        const defaultSponsorId = '763746716243066890';
        const targetId = sponsorId || defaultSponsorId;

        try {
            // Fetch the sponsor user
            const sponsor = await this.client.users.fetch(targetId).catch(() => null);

            if (!sponsor) {
                return ctx.sendMessage({
                    content: `${emoji.status.error} Could not find sponsor with that ID.`,
                    flags: 64
                });
            }

            // Get sponsor's avatar URL
            const avatarURL = sponsor.displayAvatarURL({ size: 512, extension: 'png' });

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`# ${emoji.karaoke.star} Our Amazing Sponsor`)
                )
                .addMediaGalleryComponents(
                    new MediaGalleryBuilder().addItems(
                        new MediaGalleryItemBuilder().setURL(avatarURL).setDescription(`${sponsor.username}'s profile picture`)
                    )
                )
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `${emoji.karaoke.party} **Thank you for sponsoring Vocal Vibes!**\n\n` +
                        `${emoji.misc.divider}\n\n` +
                        `${emoji.karaoke.crown} **Sponsor:** ${sponsor.username}\n` +
                        `${emoji.misc.id} **ID:** \`${sponsor.id}\`\n` +
                        `${emoji.karaoke.microphone} **Mention:** <@${sponsor.id}>\n\n` +
                        `${emoji.misc.divider}\n\n` +
                        `${emoji.karaoke.music} Your generous support helps keep Vocal Vibes running and brings joy to karaoke lovers everywhere!\n\n` +
                        `${emoji.karaoke.party} *Thank you for believing in our community and making karaoke nights possible!*`
                    )
                );

            return ctx.sendMessage({ components: [container], flags: 32768 });

        } catch (error) {
            console.error('Sponsor command error:', error);
            return ctx.sendMessage({
                content: `${emoji.status.error} An error occurred while fetching sponsor information.`,
                flags: 64
            });
        }
    }
}
