import { type Bet, api } from '../api';
import type { View } from '../main';
import { $, $$, bindStake, deckCard, fairBox, frags, guard, hiddenCard, readNum, stakeField } from '../ui';

type Action = 'hit' | 'stand' | 'double' | 'split';
interface Hand { cards: number[]; total?: number; soft?: boolean; doubled: boolean; done?: boolean }
interface Result { stake: number; payout: number; outcome: 'blackjack' | 'win' | 'push' | 'lose' | 'bust' }
interface BjBet extends Bet<{ hands: Hand[]; dealer: number[]; dealerBlackjack: boolean; results: Result[]; actions: Action[] }> {
  hands?: Hand[]; dealer?: { up: number; upValue: number }; active?: number; actions?: Action[]; baseStake?: number;
}

const value = (c: number) => Math.min(10, (c % 13) + 1);
function total(cards: number[]) {
  let hard = 0, ace = false;
  for (const c of cards) { const v = value(c); hard += v; if (v === 1) ace = true; }
  return ace && hard + 10 <= 21 ? { total: hard + 10, soft: true } : { total: hard, soft: false };
}
const OUTCOME: Record<Result['outcome'], string> = { blackjack: 'Blackjack 3:2', win: 'Win', push: 'Push', lose: 'Lose', bust: 'Bust' };
const LABEL: Record<Action, string> = { hit: 'Hit', stand: 'Stand', double: 'Double', split: 'Split' };

export const blackjackView: View = {
  title: 'Blackjack',
  html: () => `
  <section class="game">
    <div class="game-stage">
      <div class="game-head">
        <div><p class="eyebrow">Original · Cards</p><h1 class="h-display">Blackjack</h1>
          <p>Blackjack pays 3:2, dealer stands on soft 17 and peeks for blackjack. Double on any two cards, split once. With perfect play the RTP is 99.31 %; it is a skill game, so mistakes lower it.</p></div>
        <div class="big-mult" id="res"></div>
      </div>
      <div class="felt">
        <div><p class="eyebrow" style="color:var(--muted)">Dealer <span class="num" id="dtotal"></span></p><div class="cardrow" id="dealer"></div></div>
        <div class="hands" id="hands"></div>
      </div>
      <div class="row" id="actions">${(['hit', 'stand', 'double', 'split'] as Action[]).map((a) => `<button class="btn ${a === 'stand' ? 'ghost' : ''}" type="button" data-act="${a}" disabled>${LABEL[a]}</button>`).join('')}</div>
      <p class="status" id="status" role="status">Set your stake and deal.</p>
    </div>
    <aside class="game-side">
      ${stakeField('stake', 10)}
      <button class="btn block" id="deal" type="button">Deal</button>
      <div id="fair"></div>
      <p class="muted" style="font-size:12px">Infinite deck: every card is ⌊f · 52⌋ from your seed stream, drawn in order (you, dealer up, you, dealer hole, then as needed). The hole card is fixed from the start and stays on the server until the hand ends. Double and split place a second stake of the same size.</p>
    </aside>
  </section>`,
  mount: (root, c) => {
    bindStake(root);
    let bet: BjBet | null = null;
    const status = (t: string, cls = '') => { const s = $('#status', root); s.textContent = t; s.className = `status ${cls}`; };

    const draw = () => {
      const open = bet?.status === 'open';
      const settled = bet?.status === 'settled' ? bet.result! : null;
      const hands: Hand[] = (open ? bet!.hands : settled?.hands) ?? [];
      if (open) {
        $('#dealer', root).innerHTML = deckCard(bet!.dealer!.up) + hiddenCard();
        $('#dtotal', root).textContent = `${bet!.dealer!.upValue === 1 ? 'A' : bet!.dealer!.upValue} showing`;
      } else if (settled) {
        $('#dealer', root).innerHTML = settled.dealer.map((cd) => deckCard(cd, 'deal')).join('');
        const t = total(settled.dealer).total;
        $('#dtotal', root).textContent = settled.dealerBlackjack ? 'Blackjack' : t > 21 ? `${t} · bust` : String(t);
      } else { $('#dealer', root).innerHTML = ''; $('#dtotal', root).textContent = ''; }
      $('#hands', root).innerHTML = hands.map((h, i) => {
        const t = total(h.cards);
        const res = settled?.results[i];
        return `<div class="hand ${open && bet!.active === i ? 'active' : ''}">
          <div class="cardrow">${h.cards.map((cd) => deckCard(cd)).join('')}</div>
          <span class="total">${t.soft && t.total < 21 ? `soft ${t.total}` : t.total}${h.doubled ? ' · doubled' : ''}${res ? ` · <b class="${res.payout > res.stake ? 'pos' : res.payout === res.stake ? '' : 'neg'}">${OUTCOME[res.outcome]}</b>` : ''}</span></div>`;
      }).join('');
      $$<HTMLButtonElement>('[data-act]', root).forEach((b) => { b.disabled = !open || !bet!.actions!.includes(b.dataset.act as Action); });
      $('#deal', root).hidden = open;
      const r = $('#res', root);
      if (settled) {
        const net = bet!.payout - bet!.stake;
        r.textContent = `${net > 0 ? '+' : net < 0 ? '−' : '±'}${frags(Math.abs(net))}`;
        r.className = `big-mult ${net > 0 ? 'win' : net < 0 ? 'lose' : ''}`;
      } else { r.textContent = ''; r.className = 'big-mult'; }
      $('#fair', root).innerHTML = bet ? fairBox(bet.fairness) : fairBox({ ...c.me.seed, nonce: c.me.seed.nextNonce });
    };

    const finished = async () => {
      const r = bet!.result!;
      const outcomes = r.results.map((x) => OUTCOME[x.outcome]).join(' / ');
      status(`${outcomes}. Paid ${frags(bet!.payout)} Frags on ${frags(bet!.stake)} staked.`, bet!.payout > bet!.stake ? 'win' : bet!.payout < bet!.stake ? 'lose' : '');
      await c.refresh();
    };
    $$<HTMLButtonElement>('[data-act]', root).forEach((b) => b.addEventListener('click', () => guard(b, async () => {
      if (!bet || bet.status !== 'open') return;
      bet = await api<BjBet>('POST', `/blackjack/${bet.id}/action`, { action: b.dataset.act });
      draw();
      if (bet.status === 'settled') await finished();
      else status(bet.hands!.length > 1 ? `Hand ${bet.active! + 1} of ${bet.hands!.length}.` : 'Your move.');
      if (b.dataset.act === 'double' || b.dataset.act === 'split') await c.refresh();
    })));
    $('#deal', root).addEventListener('click', (e) => guard(e.currentTarget as HTMLButtonElement, async () => {
      bet = await api<BjBet>('POST', '/blackjack/start', { stake: readNum($<HTMLInputElement>('#stake', root).value) });
      draw();
      if (bet.status === 'settled') await finished();
      else { status('Your move.'); await c.refresh(); }
    }));
    api<BjBet[]>('GET', '/games/open').then((g) => {
      const r = g.find((x) => x.game === 'blackjack');
      if (r) { bet = r; status(`Open hand found (${frags(r.baseStake ?? r.stake)} Frags). Your move.`); draw(); }
    }).catch(() => null);
    draw();
  },
};
