import { api } from '../api';
import type { View } from '../main';
import { verifyHref } from './verify';
import { $, esc, guard, toast } from '../ui';

interface Rotation { next: { serverSeedHash: string; clientSeed: string; nextNonce: number } }
interface Revealed { serverSeed: string; serverSeedHash: string; clientSeed: string; bets: number; createdAt: number; revealedAt: number }

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
    <div class="tablewrap"><table><thead><tr><th>Revealed</th><th>Server seed</th><th>Hash</th><th>Client seed</th><th class="r">Bets</th><th></th></tr></thead><tbody id="revealed"><tr><td colspan="6" class="muted">Loading …</td></tr></tbody></table></div>
    <p class="muted" style="font-size:13px">Every bet made with a revealed pair can be replayed: open it in <a href="#/history">History</a> and press “Verify in browser”, or use the <a href="#/verify">Verifier</a> with server seed, client seed and the bet's nonce (0 … bets − 1).</p>
  </section>
  <section class="card">
    <h2 class="h-sect">How it works</h2>
    <div class="how-grid">
      <div><b>1 · Commitment</b><span>Before your first bet you see <code>sha256(server seed)</code>. The seed itself stays secret until you rotate.</span></div>
      <div><b>2 · Your input</b><span>Your client seed and a nonce that counts up by one per bet go into every round.</span></div>
      <div><b>3 · Randomness</b><span><code>HMAC-SHA256(server seed, client:nonce:round)</code> gives 32 bytes; every 4 bytes are one float in [0, 1).</span></div>
      <div><b>4 · Shared games</b><span>Crash and Bandit Wheel run on a published hash chain, PvP and Jackpot on a public beacon round nobody knows in advance.</span></div>
    </div>
  </section>`,
  mount: (root, c) => {
    const paint = async () => {
      const { revealed } = await api<{ revealed: Revealed[] }>('GET', '/seeds');
      $('#revealed', root).innerHTML = revealed.length
        ? revealed.map((x) => `<tr><td class="num" style="font-size:12px;white-space:nowrap">${new Date(x.revealedAt).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })}</td>
            <td class="num" style="word-break:break-all;font-size:12px">${esc(x.serverSeed)}</td><td class="num" style="word-break:break-all;font-size:12px">${esc(x.serverSeedHash)}</td><td class="num">${esc(x.clientSeed)}</td><td class="r num">${x.bets}</td>
            <td class="r">${x.bets ? `<a class="btn ghost small" href="${verifyHref({ game: 'dice', serverSeed: x.serverSeed, serverHash: x.serverSeedHash, clientSeed: x.clientSeed, nonce: 0 })}">Verify</a>` : ''}</td></tr>`).join('')
        : '<tr><td colspan="6" class="muted">Nothing rotated yet.</td></tr>';
    };
    void paint().catch(() => null);
    $('#rotate', root).addEventListener('click', (e) => guard(e.currentTarget as HTMLButtonElement, async () => {
      const v = ($('#client', root) as HTMLInputElement).value.trim();
      const r = await api<Rotation>('POST', '/seed/rotate', v ? { clientSeed: v } : {});
      await c.refresh();
      $('#active', root).innerHTML = `<dt>Server seed hash</dt><dd>${esc(r.next.serverSeedHash)}</dd><dt>Client seed</dt><dd>${esc(r.next.clientSeed)}</dd><dt>Next nonce</dt><dd>${r.next.nextNonce}</dd>`;
      await paint();
      toast('Seed revealed. Your previous bets can now be verified.');
    }));
  },
};
