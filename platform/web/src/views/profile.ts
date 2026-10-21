import { api } from '../api';
import { icon } from '../icons';
import type { View } from '../main';
import { $, errorText, esc, frags, guard, modal, mult, toast } from '../ui';

interface Pick { ref: string; game: string; gameName: string; stake: number; payout: number; multiplier: number }
interface Stats {
  memberSince: number | null; bets: number; wagered: number; paid: number; net: number; bestMultiplier: Pick | null; biggestWin: Pick | null; activeSessions: number;
  games: { game: string; gameName: string; bets: number; wagered: number; paid: number }[];
}
interface Profile { displayName: string; hidePublic: boolean; nameChangeAt: number | null }

const day = (t: number) => new Date(t).toLocaleDateString('en-US', { dateStyle: 'medium' });

export const profileView: View = {
  title: 'Profile',
  html: (c) => `
  <section class="card">
    <div class="sect-head"><div><p class="eyebrow">Account</p><h1 class="h-display">${esc(c.me.displayName)}</h1>
      <p class="muted" id="p-since">Level ${c.me.level}</p></div>
      <div class="row"><a class="btn ghost" href="#/history">${icon('clock')} History</a><a class="btn ghost" href="#/wallet">${icon('pot')} Wallet</a></div></div>
    <div class="stats" id="p-stats" aria-label="Lifetime figures">
      <div><b id="ps-bets">–</b><span>rounds played</span></div>
      <div><b id="ps-wag">–</b><span>Frags wagered</span></div>
      <div><b id="ps-net">–</b><span>net result</span></div>
      <div><b id="ps-best">–</b><span id="ps-best-l">best multiplier</span></div>
    </div>
  </section>
  <div class="admin-grid">
    <section class="card">
      <h2 class="h-sect">${icon('user')} Profile</h2>
      <form class="vf-fields" id="p-form" novalidate style="display:flex;flex-direction:column;gap:12px">
        <label class="field">Display name<input id="p-name" maxlength="24" autocomplete="nickname" value="${esc(c.me.displayName)}"></label>
        <p class="muted" style="font-size:12px" id="p-name-hint">Shown in chat and, unless hidden below, in public lists. You can change it once every 24 hours.</p>
        <label class="check"><input type="checkbox" id="p-hide"> <span>Hide my name in public lists (live bets, crash, wheel, jackpot, battles). You still see your own seats.</span></label>
        <div><button class="btn" type="submit">Save</button></div>
      </form>
    </section>
    <section class="card">
      <h2 class="h-sect">${icon('shield')} Security</h2>
      <dl class="fairbox plain">
        <dt>Signed in</dt><dd id="p-sessions">–</dd>
        <dt>Steam</dt><dd>${c.me.steamLinked ? 'linked' : 'not linked'}</dd>
        <dt>Identity check</dt><dd>${c.me.kycLevel > 0 ? `level ${c.me.kycLevel}` : 'not needed for play money'}</dd>
        ${c.me.role !== 'player' ? `<dt>Operator MFA</dt><dd>${c.me.mfa.enrolled ? 'enrolled' : 'not enrolled (Backoffice → security)'}</dd>` : ''}
        <dt>Seed pair</dt><dd>${esc(c.me.seed.serverSeedHash.slice(0, 24))}… · <a href="#/fair">manage</a></dd>
      </dl>
      <div class="row"><button class="btn ghost" type="button" id="p-logout-all">Sign out everywhere</button></div>
      <p class="muted" style="font-size:12px">Ends every session of this account, this one included.</p>
    </section>
  </div>
  <section class="card">
    <h2 class="h-sect">Per game</h2>
    <div class="tablewrap"><table><thead><tr><th>Game</th><th class="r">Rounds</th><th class="r">Wagered</th><th class="r">Paid out</th><th class="r">Your RTP</th></tr></thead><tbody id="p-games"><tr><td colspan="5" class="muted">Loading …</td></tr></tbody></table></div>
    <p class="muted" style="font-size:12px">A few rounds swing a lot; the published RTP is what thousands of rounds settle towards.</p>
  </section>`,
  mount: (root, c) => {
    let prof: Profile | null = null;
    const paintProfile = (p: Profile) => {
      prof = p;
      ($('#p-hide', root) as HTMLInputElement).checked = p.hidePublic;
      if (p.nameChangeAt && p.nameChangeAt > Date.now()) $('#p-name-hint', root).textContent = `Name changes again possible from ${new Date(p.nameChangeAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}.`;
    };
    api<Profile>('GET', '/me/profile').then(paintProfile).catch(() => null);
    api<Stats>('GET', '/me/stats').then((s) => {
      $('#ps-bets', root).textContent = s.bets.toLocaleString('en-US');
      $('#ps-wag', root).textContent = frags(s.wagered, 0);
      const net = $('#ps-net', root);
      net.textContent = `${s.net > 0 ? '+' : s.net < 0 ? '−' : ''}${frags(Math.abs(s.net))}`;
      net.className = s.net > 0 ? 'pos' : s.net < 0 ? 'neg' : '';
      if (s.bestMultiplier) { $('#ps-best', root).textContent = mult(s.bestMultiplier.multiplier); $('#ps-best-l', root).textContent = `best multiplier · ${s.bestMultiplier.gameName}`; }
      if (s.memberSince) $('#p-since', root).textContent = `Level ${c.me.level} · member since ${day(s.memberSince)}${s.biggestWin && s.biggestWin.payout > 0 ? ` · biggest win ${frags(s.biggestWin.payout)} Frags on ${s.biggestWin.gameName}` : ''}`;
      $('#p-sessions', root).textContent = `${s.activeSessions} device${s.activeSessions === 1 ? '' : 's'}`;
      $('#p-games', root).innerHTML = s.games.length ? s.games.map((g) => `<tr><td>${esc(g.gameName)}</td><td class="r num">${g.bets.toLocaleString('en-US')}</td><td class="r num">${frags(g.wagered)}</td><td class="r num">${frags(g.paid)}</td>
        <td class="r num">${g.wagered ? `${((g.paid / g.wagered) * 100).toFixed(2)} %` : '–'}</td></tr>`).join('') : '<tr><td colspan="5" class="muted">No rounds yet.</td></tr>';
    }).catch(() => null);

    $('#p-form', root).addEventListener('submit', (e) => {
      e.preventDefault();
      void guard($<HTMLButtonElement>('#p-form button', root), async () => {
        const name = ($('#p-name', root) as HTMLInputElement).value.trim();
        const hide = ($('#p-hide', root) as HTMLInputElement).checked;
        const body: Record<string, unknown> = {};
        if (name !== prof?.displayName) body.displayName = name;
        if (hide !== prof?.hidePublic) body.hidePublic = hide;
        if (!Object.keys(body).length) { toast('Nothing changed.'); return; }
        paintProfile(await api<Profile>('PUT', '/me/profile', body));
        await c.refresh();
        toast('Profile saved.');
        c.rerender();
      });
    });
    $('#p-logout-all', root).addEventListener('click', () => {
      const m = modal(`<p class="eyebrow">Security</p><h2 class="h-sect" style="font-size:20px">Sign out on every device?</h2>
        <p class="muted">Every session of this account ends now, this one included. You sign in again afterwards.</p>
        <div class="row"><button class="btn" type="button" data-yes>Sign out everywhere</button><button class="btn ghost" type="button" data-no>Cancel</button></div>`);
      m.root.querySelector('[data-no]')?.addEventListener('click', m.close);
      const yes = m.root.querySelector<HTMLButtonElement>('[data-yes]')!;
      yes.addEventListener('click', () => guard(yes, async () => {
        await api('POST', '/auth/logout-all').catch((e) => { toast(errorText(e), 'err'); throw e; });
        m.close();
        c.signOut('Signed out on every device.');
      }));
    });
  },
};
