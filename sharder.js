// Workaround for SSL issues on Windows with Node.js v21
import tls from 'tls';
import https from 'https';

tls.DEFAULT_MIN_VERSION = 'TLSv1.2';
tls.DEFAULT_MAX_VERSION = 'TLSv1.3';

const agent = new https.Agent({
    rejectUnauthorized: false,
    minVersion: 'TLSv1.2',
    maxVersion: 'TLSv1.3'
});
https.globalAgent = agent;

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import { config } from "./src/config.js";
import { ShardingManager } from "discord.js";
import Logger from "./src/structures/Logger.js";
const logger = new Logger({
  displayTimestamp: true,
  displayDate: true,
});
const manager = new ShardingManager("./src/index.js", {
  respawn: true,
  autoSpawn: true,
  token: config.token,
  totalShards: 1,
  shardList: "auto",
  execArgv: ['--no-warnings'],
});

manager.spawn({ amount: manager.totalShards, delay: null, timeout: -1 }).then((shards) => {
    logger.start(`[CLIENT] ${shards.size} shard(s) spawned.`);
  }).catch((err) => {
    logger.error("[CLIENT] An error has occurred :", err);
  });

manager.on("shardCreate", (shard) => {
  shard.on("ready", () => {
    logger.start(`[CLIENT] Shard ${shard.id} connected to Discord's Gateway.`);
  });
});

manager.on("error", (error) => {
    logger.error(`[SHARD MANAGER] An error occurred: ${error.message}`);
});