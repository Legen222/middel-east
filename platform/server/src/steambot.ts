/**
 * The Steam trade bot behind the skin rail (runs in bot-main.ts, never in the API process).
 * Logs in with the account's password and a Steam Guard code from its Mobile Authenticator shared_secret,
 * then uses the web session for trade offers. Deposits only ask for the player's items, so no mobile
 * confirmation is needed; identity_secret is only used if an offer that gives items ever needs one.
 * Secrets come from the environment only and are never logged.
 */

import SteamUser from 'steam-user';
import SteamCommunity from 'steamcommunity';
import TradeOfferManager from 'steam-tradeoffer-manager';
import SteamTotp from 'steam-totp';

import { type BotItem, type OfferState, RUST_APPID, type TradeBot } from './skins';

export interface BotCredentials { accountName: string; password: string; sharedSecret: string; identitySecret: string | null }

/** ETradeOfferState → what the deposit worker cares about. */
const STATE: Record<number, OfferState> = {
  1: 'invalid', 2: 'active', 3: 'accepted', 4: 'countered', 5: 'expired', 6: 'canceled', 7: 'declined', 8: 'invalid', 9: 'needs_confirmation', 10: 'canceled', 11: 'escrow',
};
const OFFER_FILTER_ALL = 3;
const CONTEXT = 2;

const call = <T>(fn: (cb: (err: Error | null, v?: T) => void) => void) => new Promise<T>((resolve, reject) => fn((err, v) => (err ? reject(err) : resolve(v as T))));

const item = (i: { assetid: string; new_assetid?: string; market_hash_name: string; icon_url?: string; tradable: boolean | number }): BotItem =>
  ({ assetId: String(i.new_assetid ?? i.assetid), name: i.market_hash_name, icon: i.icon_url ?? null, tradable: Boolean(i.tradable) });

export class SteamTradeBot implements TradeBot {
  private client = new SteamUser({ autoRelogin: true });
  private community = new SteamCommunity();
  private manager = new TradeOfferManager({ steam: this.client, community: this.community, language: 'en', pollInterval: -1 });
  private ready = false;
  private retry: ReturnType<typeof setTimeout> | null = null;

  constructor(private creds: BotCredentials, log: (l: Record<string, unknown>) => void) {
    this.client.on('loggedOn', () => log({ msg: 'bot logged on', steamId: this.steamId() }));
    this.client.on('steamGuard', (_domain, callback, lastCodeWrong) => {
      // a rejected code is usually one already used: wait for the next 30-second window
      setTimeout(() => callback(SteamTotp.generateAuthCode(this.creds.sharedSecret)), lastCodeWrong ? 30_000 : 0);
    });
    this.client.on('webSession', (_sid, cookies) => {
      this.community.setCookies(cookies);
      this.manager.setCookies(cookies, (err) => {
        if (err) { this.ready = false; log({ level: 'error', msg: 'bot web session refused', error: err.message }); return; }
        this.ready = true;
        log({ msg: 'bot ready for trade offers' });
      });
    });
    this.community.on('sessionExpired', () => { this.ready = false; this.client.webLogOn(); });
    this.client.on('disconnected', () => { this.ready = false; });
    this.client.on('error', (err) => {
      this.ready = false;
      log({ level: 'error', msg: 'bot login failed', error: err.message });
      if (!this.retry) this.retry = setTimeout(() => { this.retry = null; this.start(); }, 5 * 60_000);
    });
  }

  start(): void {
    this.client.logOn({ accountName: this.creds.accountName, password: this.creds.password, twoFactorCode: SteamTotp.generateAuthCode(this.creds.sharedSecret) });
  }

  stop(): void {
    if (this.retry) clearTimeout(this.retry);
    this.manager.shutdown();
    this.client.logOff();
  }

  steamId(): string | null { return this.client.steamID?.getSteamID64() ?? null; }
  online(): boolean { return this.ready; }

  async partnerEscrowDays(tradeUrl: string): Promise<number> {
    const offer = this.manager.createOffer(tradeUrl);
    const them = await new Promise<{ escrowDays: number }>((resolve, reject) => offer.getUserDetails((err, _me, them) => (err || !them ? reject(err ?? new Error('no details')) : resolve(them))));
    return Number(them.escrowDays) || 0;
  }

  async requestItems(tradeUrl: string, assetIds: string[], message: string): Promise<string> {
    const offer = this.manager.createOffer(tradeUrl);
    offer.addTheirItems(assetIds.map((assetid) => ({ appid: RUST_APPID, contextid: String(CONTEXT), assetid })));
    offer.setMessage(message);
    const status = await call<'pending' | 'sent'>((cb) => offer.send(cb));
    if (!offer.id) throw new Error('Steam returned no offer id');
    if (status === 'pending') {
      if (!this.creds.identitySecret) throw new Error('the offer needs a mobile confirmation and BOT_IDENTITY_SECRET is not set');
      await call<void>((cb) => this.community.acceptConfirmationForObject(this.creds.identitySecret!, offer.id!, cb));
    }
    return offer.id;
  }

  async findOffer(tag: string, since: number): Promise<string | null> {
    const sent = await new Promise<{ id: string | null; message: string }[]>((resolve, reject) =>
      this.manager.getOffers(OFFER_FILTER_ALL, new Date(since - 60_000), (err, s) => (err ? reject(err) : resolve(s ?? []))));
    return sent.find((o) => (o.message ?? '').includes(tag))?.id ?? null;
  }

  async offer(offerId: string): Promise<{ state: OfferState; received: BotItem[] | null }> {
    const o = await call<NonNullable<Parameters<Parameters<TradeOfferManager['getOffer']>[1]>[1]>>((cb) => this.manager.getOffer(offerId, cb));
    const state = STATE[o.state] ?? 'invalid';
    if (state !== 'accepted') return { state, received: null };
    // new asset ids of what came in; on failure the next inventory sync picks the items up
    const received = await new Promise<BotItem[] | null>((resolve) => o.getExchangeDetails((err, _st, _t, rec) => resolve(err ? null : (rec ?? []).map(item))));
    return { state, received };
  }

  async cancel(offerId: string): Promise<void> {
    const o = await call<NonNullable<Parameters<Parameters<TradeOfferManager['getOffer']>[1]>[1]>>((cb) => this.manager.getOffer(offerId, cb));
    await call<void>((cb) => o.cancel(cb));
  }

  async inventory(): Promise<BotItem[]> {
    return (await call<Parameters<Parameters<TradeOfferManager['getInventoryContents']>[3]>[1]>((cb) => this.manager.getInventoryContents(RUST_APPID, CONTEXT, false, cb)) ?? []).map(item);
  }
}
