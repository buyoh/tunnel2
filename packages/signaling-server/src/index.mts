import * as http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { createSignalingServer } from './app/server.mjs';
import { KeyStore } from './app/key-store.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.SIGNALING_PORT) || 3000;
const DEBUG = process.env.SIGNALING_DEBUG === '1';
const ALLOWED_ORIGINS = process.env.SIGNALING_ALLOWED_ORIGINS
  ? process.env.SIGNALING_ALLOWED_ORIGINS.split(',').filter(Boolean)
  : [];

const app = express();
const httpServer = http.createServer(app);
const keyStore = new KeyStore(path.resolve(__dirname, '../keys.json'));

createSignalingServer(httpServer, keyStore, {
  debug: DEBUG,
  allowedOrigins: ALLOWED_ORIGINS,
  rateLimit: {
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000,
    maxPerIp: Number(process.env.RATE_LIMIT_MAX_PER_IP) || 5,
    maxGlobal: Number(process.env.RATE_LIMIT_MAX_GLOBAL) || 30,
    maxTrackedIps: Number(process.env.RATE_LIMIT_MAX_TRACKED_IPS) || 10_000,
  },
});

httpServer.listen(PORT, () => {
  console.log(`Signaling server listening on port ${PORT}`);
});