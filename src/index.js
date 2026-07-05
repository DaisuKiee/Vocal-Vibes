// Workaround for SSL issues on Windows with Node.js v21
// Force TLS 1.2 minimum version before any imports
import tls from 'tls';
import https from 'https';

tls.DEFAULT_MIN_VERSION = 'TLSv1.2';
tls.DEFAULT_MAX_VERSION = 'TLSv1.3';

// Create custom HTTPS agent with relaxed SSL settings
const agent = new https.Agent({
    rejectUnauthorized: false,
    minVersion: 'TLSv1.2',
    maxVersion: 'TLSv1.3',
    secureOptions: 0
});
https.globalAgent = agent;

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Suppress SSL error logging
const originalConsoleError = console.error;
console.error = (...args) => {
    const msg = args[0]?.toString() || '';
    if (msg.includes('SSL') || msg.includes('ssl') || msg.includes('handshake') || args[0]?.code === 'ERR_SSL_SSLV3_ALERT_HANDSHAKE_FAILURE') {
        return; // Suppress SSL errors
    }
    originalConsoleError.apply(console, args);
};

import { BotClient } from "./structures/Client.js";
import { startWebServer } from "./web/server.js";

const client = new BotClient();

// Prevent crashes from unhandled rejections (SSL errors, etc.)
process.on('unhandledRejection', (error) => {
    // Suppress SSL handshake errors (common on Windows with Node.js v21)
    if (error?.code === 'ERR_SSL_SSLV3_ALERT_HANDSHAKE_FAILURE') return;
    if (error?.message?.includes('SSL')) return;
    if (error?.message?.includes('handshake')) return;
    console.error('Unhandled rejection:', error.message || error);
});

process.on('uncaughtException', (error) => {
    // Suppress SSL handshake errors
    if (error?.code === 'ERR_SSL_SSLV3_ALERT_HANDSHAKE_FAILURE') return;
    if (error?.message?.includes('SSL')) return;
    if (error?.message?.includes('handshake')) return;
    console.error('Uncaught exception:', error.message || error);
});

(async () => {
    await client.start();
    
    // Start web server after bot is ready
    client.once('ready', () => {
        startWebServer(client);
    });
})();

export default client;