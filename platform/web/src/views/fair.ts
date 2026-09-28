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
    <p class="eyebrow">Open blueprint</p>
    <h1 class="h-display">Provably Fair</h1>
    <p class="muted" style="max-width:66ch">Every round comes from <code>HMAC-SHA256(server seed, client seed:nonce:round)</code>. You see the server seed's hash up front and the seed itself after rotating. Then you can recompute every round exactly in the verifier.</p>
  </section>
  <section class="card">
    <h2 class="h-sect">Active seed pair</h2>
    <dl class="fairbox" id="active">
      <dt>Server seed hash</dt><dd>${esc(c.me.seed.serverSeedHash)}</dd>
      <dt>Client seed</dt><dd>${esc(c.me.seed.clientSeed)}</dd>
      <dt>Next nonce</dt><dd>${c.me.seed.nextNonce}</dd>
    </dl>
    <div class="row">
      <label class="field" style="flex:1;min-width:200px">New client seed (optional)<input id="client" maxlength="64" placeholder="empty = random"></label>
      <button class="btn" id="rotate" type="button" style="align-self:flex-end">Rotate seed</button>
    </div>
    <p class="muted" style="font-size:13px">Rotating reveals the current server seed and starts a new pair at nonce 0. Not possible while a Minefield or Raid round is open.</p>
  </section>
  <section class="card">
    <h2 class="h-sect">Revealed seeds</h2>
    <div class="tablewrap"><table><thead><tr><th>Server seed</th><th>Hash</th><th>Client seed</th><th class="r">Bets</th></tr></thead><tbody id="revealed"></tbody></table></div>
    <p class="muted" style="font-size:13px">To verify: enter server seed, client seed and nonce in the <b>SCRAPLINE fairness verifier</b> (<code>platform/engine/verify/verify.html</code>). Every single bet is listed in History.</p>
  </section>`,
  mount: (root, c) => {
    const paint = () => {
      const r = loadRevealed();
      $('#revealed', root).innerHTML = r.length
        ? r.map((x) => `<tr><td class="num" style="word-break:break-all;font-size:12px">${esc(x.server_seed)}</td><td class="num" style="word-break:break-all;font-size:12px">${esc(x.server_hash)}</td><td class="num">${esc(x.client_seed)}</td><td class="r num">${x.nonce}</td></tr>`).join('')
        : '<tr><td colspan="4" class="muted">Nothing rotated yet.</td></tr>';
    };
    paint();
    $('#rotate', root).addEventListener('click', (e) => guard(e.currentTarget as HTMLButtonElement, async () => {
      const v = ($('#client', root) as HTMLInputElement).value.trim();
      const r = await api<Rotation>('POST', '/seed/rotate', v ? { clientSeed: v } : {});
      saveRevealed([r.revealed, ...loadRevealed()]);
      await c.refresh();
      $('#active', root).innerHTML = `<dt>Server seed hash</dt><dd>${esc(r.next.serverSeedHash)}</dd><dt>Client seed</dt><dd>${esc(r.next.clientSeed)}</dd><dt>Next nonce</dt><dd>${r.next.nextNonce}</dd>`;
      paint();
      toast('Seed revealed. Your previous bets can now be verified.');
    }));
  },
};
