import { CommandInteraction, Message, ButtonInteraction, StringSelectMenuInteraction, ModalSubmitInteraction } from "discord.js";

export default class Context {
    constructor(ctx, args) {
        this.ctx = ctx;
        this.isInteraction = !(ctx instanceof Message);
        this.interaction = this.isInteraction ? ctx : null;
        this.message = this.isInteraction ? null : ctx;
        this.id = ctx.id;
        this.channelId = ctx.channelId;
        this.client = ctx.client;
        this.author = ctx instanceof Message ? ctx.author : ctx.user;
        this.channel = ctx.channel;
        this.guild = ctx.guild;
        this.createdAt = ctx.createdAt;
        this.createdTimestamp = ctx.createdTimestamp;
        this.member = ctx.member;
        this.setArgs(args || []);
    }

    setArgs(args) {
        if (this.isInteraction && Array.isArray(args)) {
            this.args = args.map(arg => arg?.value ?? arg);
        } else if (Array.isArray(args)) {
            this.args = args;
        } else {
            this.args = [];
        }
    }

    async sendMessage(content) {
        if (this.isInteraction) {
            // Check if already replied or deferred
            if (this.interaction.replied || this.interaction.deferred) {
                this.msg = await this.interaction.followUp(content);
            } else {
                this.msg = await this.interaction.reply(content);
            }
            return this.msg;
        } else {
            this.msg = await this.message.channel.send(content);
            return this.msg;
        }
    }

    async editMessage(content) {
        if (this.isInteraction) {
            this.msg = await this.interaction.editReply(content);
            return this.msg;
        } else {
            this.msg = await this.msg.edit(content);
            return this.msg;
        }
    }

    async sendDeferMessage(content) {
        if (this.isInteraction) {
            this.msg = await this.interaction.deferReply({ fetchReply: true });
            return this.msg;
        } else {
            this.msg = await this.message.channel.send(content);
            return this.msg;
        }
    }

    async sendFollowUp(content) {
        if (this.isInteraction) {
            await this.interaction.followUp(content);
        } else {
            await this.channel.send(content);
        }
    }
}
