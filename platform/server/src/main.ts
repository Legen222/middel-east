/** Starts the demo API. Env: PORT (8787), DB_PATH (data/scrapline-demo.sqlite), PUBLIC_URL. */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { DEFAULT_CONFIG, systemClock } from './config';
import { openDb } from './db';
import { createApp } from './http';

const port = Number(process.env.PORT ?? 8787);
const dbPath = process.env.DB_PATH ?? 'data/scrapline-demo.sqlite';
mkdirSync(dirname(dbPath), { recursive: true });

const app = createApp({
  db: openDb(dbPath),
  cfg: { ...DEFAULT_CONFIG, demo: true }, // real money stays off until licence, KYC provider and payment rails exist
  clock: systemClock,
  fetch: (url, init) => fetch(url, init),
  publicUrl: process.env.PUBLIC_URL ?? `http://localhost:${port}`,
});
app.listen(port, () => console.log(`SCRAPLINE demo API on http://localhost:${port} (db: ${dbPath})`));
