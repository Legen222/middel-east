import { type Bet, api } from '../api';
import type { View } from '../main';
import { $, bindStake, fairBox, frags, guard, mult, pctShort, playingCard, readNum, stakeField } from '../ui';

interface Card { rank: number; suit: number }
interface Option { chance: number; multiplier: number }
interface HiloBet extends Bet<{ cards: Card[]; moves: ('hi' | 'lo' | 'skip')[]; chances: number[] }> {
  cards?: Card[]; moves?: ('hi' | 'lo' | 'skip')[]; skips?: number; currentMultiplier?: number; guesses?: number; hi?: Option | null; lo?: Option | null;
}
const NAMES = ['ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king'];

export const hiloView: View = {
  title: 'Hi-Lo',
  html: () => `
  <section class="game">
    <div class="game-stage">
      <div class="game-head">
        <div><p class="eyebrow">Original · Cards</p><h1 class="h-display">Hi-Lo</h1>
          <p>Guess whether the next card is higher or lower. Equal ranks count for both sides. Each correct guess multiplies by 0.97 ÷ chance; skip a card for free. 97 % RTP whatever you pick.</p></div>
        <div class="big-mult" id="mult">1.00×</div>
      </div>
      <div class="felt">
        <div class="row" style="justify-content:center;gap:18px;align-items:center">
          <div id="current"></div>
          <div class="col" style="display:flex;flex-direction:column;gap:8px;min-width:180px">
            <button class="btn block" id="hi" type="button" disabled>Higher or same</button>
            <button class="btn block" id="lo" type="button" disabled>Lower or same</button>
            <button class="btn ghost block" id="skip" type="button" disabled>Skip card</button>
          </div>
        </div>
        <div class="cardrow" id="trail" aria-label="Cards so far"></div>
      </div>
      <p class="status" id="status" role="status">Set your stake and draw the first card.</p>
    </div>
    <aside class="game-side">
      ${stakeField('stake', 10)}
      <button class="btn block" id="start" type="button">Draw first card</button>
      <button class="btn win block" id="cash" type="button" hidden>Cash out</button>
      <div id="fair"></div>
      <p class="muted" style="font-size:12px">Card n = ⌊f<sub>n</sub> · 52⌋ (rank = n mod 13 + 1). P(higher or same) = (14 − rank) ÷ 13, P(lower or same) = rank ÷ 13. A guess that cannot lose (lower on a king, higher on an ace) is not offered.</p>
    </aside>
  </section>`,
  mount: (root, c) => {
    bindStake(root);
    let bet: HiloBet | null = null;
    const status = (t: string, cls = '') => { const s = $('#status', root); s.textContent = t; s.className = `status ${cls}`; };

    const draw = () => {
      const open = bet?.status === 'open';
      const cards = (open ? bet!.cards : bet?.result?.cards) ?? [];
      const moves = (open ? bet!.moves : bet?.result?.moves) ?? [];
      const last = cards[cards.length - 1];
      const lost = bet?.status === 'settled' && bet.payout === 0 && moves.length > 0 && moves[moves.length - 1] !== 'skip';
      $('#current', root).innerHTML = last ? playingCard(last.rank, last.suit, `big deal ${lost ? 'lose' : ''}`) : '<span class="pcard big back"></span>';
      $('#trail', root).innerHTML = cards.slice(0, -1).map((cd, i) => `<span title="${moves[i] ?? ''}">${playingCard(cd.rank, cd.suit, 'small')}</span>`).join('') + (cards.length > 1 ? '' : '<span class="muted" style="font-size:13px">Previous cards appear here.</span>');
      const opt = (id: 'hi' | 'lo', label: string) => {
        const b = $<HTMLButtonElement>(`#${id}`, root);
        const o = open ? bet![id] : null;
        b.disabled = !o;
        b.textContent = o ? `${label} · ${pctShort(o.chance)} → ${mult(o.multiplier)}` : label;
      };
      opt('hi', 'Higher or same');
      opt('lo', 'Lower or same');
      $<HTMLButtonElement>('#skip', root).disabled = !open;
      $('#start', root).hidden = open;
      const cash = $<HTMLButtonElement>('#cash', root);
      cash.hidden = !open;
      cash.disabled = !open || !bet!.guesses;
      if (open) cash.textContent = `Cash out · ${frags(bet!.stake * (bet!.currentMultiplier ?? 1))}`;
      const m = $('#mult', root);
      m.textContent = mult(open ? bet!.currentMultiplier ?? 1 : bet?.multiplier ?? 1);
      m.className = `big-mult ${bet?.status === 'settled' ? (bet.payout > 0 ? 'win' : 'lose') : ''}`;
      $('#fair', root).innerHTML = bet ? fairBox(bet.fairness) : fairBox({ ...c.me.seed, nonce: c.me.seed.nextNonce });
    };

    const move = (m: 'hi' | 'lo' | 'skip') => (e: Event) => guard(e.currentTarget as HTMLButtonElement, async () => {
      if (!bet || bet.status !== 'open') return;
      bet = await api<HiloBet>('POST', `/hilo/${bet.id}/move`, { move: m });
      const cards = (bet.status === 'open' ? bet.cards : bet.result?.cards) ?? [];
      const card = cards[cards.length - 1];
      if (bet.status === 'settled') { status(`A ${NAMES[card.rank - 1]}. Wrong guess, round lost.`, 'lose'); await c.refresh(); }
      else status(m === 'skip' ? `Skipped. Now a ${NAMES[card.rank - 1]}.` : `Correct: a ${NAMES[card.rank - 1]}. ${mult(bet.currentMultiplier ?? 1)} so far.`, m === 'skip' ? '' : 'win');
      draw();
    });
    $('#hi', root).addEventListener('click', move('hi'));
    $('#lo', root).addEventListener('click', move('lo'));
    $('#skip', root).addEventListener('click', move('skip'));
    $('#start', root).addEventListener('click', (e) => guard(e.currentTarget as HTMLButtonElement, async () => {
      bet = await api<HiloBet>('POST', '/hilo/start', { stake: readNum($<HTMLInputElement>('#stake', root).value) });
      status('Higher or lower?');
      draw();
      await c.refresh();
    }));
    $('#cash', root).addEventListener('click', (e) => guard(e.currentTarget as HTMLButtonElement, async () => {
      if (!bet) return;
      bet = await api<HiloBet>('POST', `/hilo/${bet.id}/cashout`, {});
      status(`Cashed out: ${frags(bet.payout)} Frags.`, 'win');
      draw();
      await c.refresh();
    }));
    api<HiloBet[]>('GET', '/games/open').then((g) => {
      const r = g.find((x) => x.game === 'hilo');
      if (r) { bet = r; status('Open round found. Keep guessing or cash out.'); draw(); }
    }).catch(() => null);
    draw();
  },
};
