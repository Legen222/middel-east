/**
 * Trade bot process for skin deposits. Run exactly one; with Postgres an advisory lock keeps a second
 * copy on standby (two logins to the same Steam account would keep kicking each other off).
 * Same database settings as the API (DATABASE_URL or DB_PATH), the flags in env.ts (SKINS=true), plus:
 *   BOT_ACCOUNT_NAME, BOT_PASSWORD   the bot's Steam login
 *   BOT_SHARED_SECRET                "shared_secret" of the bot's Mobile Authenticator (maFile): login codes
 *   BOT_IDENTITY_SECRET              optional "identity_secret": only for offers that need a mobile confirmation
 *   SITE_NAME                        shown in offer messages (default SCRAPLINE)
 * Deposits only. Withdrawals are sent by hand during the beta (Backoffice → Skins).
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { type DB, openDb } from './db';
import { configFromEnv } from './env';
import { PgLeader, openPg } from './pg';
import { botTick } from './skins';
import { SteamTradeBot } from './steambot';

const env = process.env;
const log = env.LOG === 'off' ? () => undefined : (line: Record<string, unknown>) => console.log(JSON.stringify({ t: new Date().toISOString(), proc: 'bot', ...line }));

const cfg = configFromEnv(env);
if (!cfg.skins.enabled) { console.error('The trade bot needs SKINS=true (and therefore DEMO=false with LICENCE_ID).'); process.exit(1); }
const missing = ['BOT_ACCOUNT_NAME', 'BOT_PASSWORD', 'BOT_SHARED_SECRET'].filter((k) => !env[k]);
if (missing.length) { console.error(`Missing ${missing.join(', ')}.`); process.exit(1); }

let db: DB;
let lock: PgLeader | null = null;
if (env.DATABASE_URL) {
  db = await openPg({ url: env.DATABASE_URL, max: 3 });
  lock = new PgLeader(env.DATABASE_URL, 7261003);
} else {
  const dbPath = env.DB_PATH ?? 'data/scrapline-demo.sqlite';
  mkdirSync(dirname(dbPath), { recursive: true });
  db = openDb(dbPath);
}

while (lock && !(await lock.tryAcquire().catch(() => false))) {
  log({ msg: 'another bot instance holds the lock; standing by' });
  await new Promise((r) => setTimeout(r, 15_000));
}

const bot = new SteamTradeBot({
  accountName: env.BOT_ACCOUNT_NAME!, password: env.BOT_PASSWORD!, sharedSecret: env.BOT_SHARED_SECRET!, identitySecret: env.BOT_IDENTITY_SECRET || null,
}, log);
bot.start();

let busy = false;
let lastSync = 0;
const timer = setInterval(async () => {
  if (busy) return;
  busy = true;
  try {
    const now = Date.now();
    const syncInventory = bot.online() && now - lastSync > 5 * 60_000;
    await botTick(db, cfg, bot, now, { syncInventory, brand: env.SITE_NAME || 'SCRAPLINE', log });
    if (syncInventory) lastSync = now;
  } catch (e) {
    log({ level: 'error', msg: 'bot tick', error: String((e as Error)?.stack ?? e) });
  } finally {
    busy = false;
  }
}, 5000);

let stopping = false;
async function stop(signal: string) {
  if (stopping) return;
  stopping = true;
  log({ msg: 'shutdown', signal });
  clearInterval(timer);
  bot.stop();
  await db.prepare("UPDATE bot_status SET online = 0, message = 'Stopped' WHERE id = 'main'").run().catch(() => undefined);
  await lock?.release();
  await db.close().catch(() => undefined);
  process.exit(0);
}
process.on('SIGTERM', () => void stop('SIGTERM'));
process.on('SIGINT', () => void stop('SIGINT'));
