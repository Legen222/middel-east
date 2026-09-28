import { api } from '../api';
import type { View } from '../main';
import { $, esc, guard, toast } from '../ui';

interface Rotation { revealed: { server_seed: string; server_hash: string; client_seed: string; nonce: number }; next: { serverSeedHash: string; clientSeed: string; nextNonce: number } }
const KEY = 'scrapline.revealed';
const loadRevealed = (): Rotation['revealed'][] => { try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; } };
const saveRevealed = (r: Rotation['revealed'][]) => { try { localStorage.setItem(KEY, JSON.stringify(r.slice(0, 20))); } catch { /* ignore */ } };

export const fairView: View = {
  title: 'Provably Fair',
  html: (c) => `
  <section class="card">
    <p class="eyebrow">Offener Bauplan</p>
    <h1 class="h-display">Provably Fair</h1>
    <p class="muted" style="max-width:66ch">Jede Runde entsteht aus <code>HMAC-SHA256(Server-Seed, Client-Seed:Nonce:Runde)</code>. Den Hash des Server-Seeds siehst du vorher, den Seed selbst nach dem Rotieren. Danach kannst du jede Runde im Prüfer exakt nachrechnen.</p>
  </section>
  <section class="card">
    <h2 class="h-sect">Aktives Seed-Paar</h2>
    <dl class="fairbox" id="active">
      <dt>Server-Seed-Hash</dt><dd>${esc(c.me.seed.serverSeedHash)}</dd>
      <dt>Client-Seed</dt><dd>${esc(c.me.seed.clientSeed)}</dd>
      <dt>Nächste Nonce</dt><dd>${c.me.seed.nextNonce}</dd>
    </dl>
    <div class="row">
      <label class="field" style="flex:1;min-width:200px">Neuer Client-Seed (optional)<input id="client" maxlength="64" placeholder="leer = zufällig"></label>
      <button class="btn" id="rotate" type="button" style="align-self:flex-end">Seed rotieren</button>
    </div>
    <p class="muted" style="font-size:13px">Rotieren legt den aktuellen Server-Seed offen und startet ein neues Paar bei Nonce 0. Während einer offenen Minenfeld- oder Raid-Runde geht das nicht.</p>
  </section>
  <section class="card">
    <h2 class="h-sect">Offengelegte Seeds</h2>
    <div class="tablewrap"><table><thead><tr><th>Server-Seed</th><th>Hash</th><th>Client-Seed</th><th class="r">Wetten</th></tr></thead><tbody id="revealed"></tbody></table></div>
    <p class="muted" style="font-size:13px">Nachrechnen: Server-Seed, Client-Seed und Nonce in den <b>SCRAPLINE Fairness-Prüfer</b> (<code>platform/engine/verify/verify.html</code>) eintragen. Jede einzelne Wette findest du im Verlauf.</p>
  </section>`,
  mount: (root, c) => {
    const paint = () => {
      const r = loadRevealed();
      $('#revealed', root).innerHTML = r.length
        ? r.map((x) => `<tr><td class="num" style="word-break:break-all;font-size:12px">${esc(x.server_seed)}</td><td class="num" style="word-break:break-all;font-size:12px">${esc(x.server_hash)}</td><td class="num">${esc(x.client_seed)}</td><td class="r num">${x.nonce}</td></tr>`).join('')
        : '<tr><td colspan="4" class="muted">Noch nichts rotiert.</td></tr>';
    };
    paint();
    $('#rotate', root).addEventListener('click', (e) => guard(e.currentTarget as HTMLButtonElement, async () => {
      const v = ($('#client', root) as HTMLInputElement).value.trim();
      const r = await api<Rotation>('POST', '/seed/rotate', v ? { clientSeed: v } : {});
      saveRevealed([r.revealed, ...loadRevealed()]);
      await c.refresh();
      $('#active', root).innerHTML = `<dt>Server-Seed-Hash</dt><dd>${esc(r.next.serverSeedHash)}</dd><dt>Client-Seed</dt><dd>${esc(r.next.clientSeed)}</dd><dt>Nächste Nonce</dt><dd>${r.next.nextNonce}</dd>`;
      paint();
      toast('Seed offengelegt. Deine bisherigen Wetten sind jetzt nachprüfbar.');
    }));
  },
};
