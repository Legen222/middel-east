/* Minimal typings for the Steam libraries the trade bot uses (they ship without types). */

declare module 'steam-user' {
  class SteamUser {
    constructor(options?: { autoRelogin?: boolean; renewRefreshTokens?: boolean });
    steamID: { getSteamID64(): string } | null;
    logOn(details: { accountName: string; password: string; twoFactorCode?: string }): void;
    webLogOn(): void;
    logOff(): void;
    on(event: 'loggedOn', fn: () => void): this;
    on(event: 'webSession', fn: (sessionId: string, cookies: string[]) => void): this;
    on(event: 'steamGuard', fn: (domain: string | null, callback: (code: string) => void, lastCodeWrong: boolean) => void): this;
    on(event: 'disconnected', fn: (eresult: number, msg?: string) => void): this;
    on(event: 'error', fn: (err: Error) => void): this;
  }
  export default SteamUser;
}

declare module 'steamcommunity' {
  class SteamCommunity {
    setCookies(cookies: string[]): void;
    acceptConfirmationForObject(identitySecret: string, objectId: string, callback: (err: Error | null) => void): void;
    on(event: 'sessionExpired', fn: (err: Error) => void): this;
  }
  export default SteamCommunity;
}

declare module 'steam-tradeoffer-manager' {
  import type SteamCommunity from 'steamcommunity';
  import type SteamUser from 'steam-user';
  interface EconItem { assetid: string; new_assetid?: string; market_hash_name: string; icon_url?: string; tradable: boolean | number }
  interface TradeOffer {
    id: string | null; state: number; message: string; isOurOffer: boolean;
    addTheirItems(items: { appid: number; contextid: string; assetid: string }[]): number;
    setMessage(message: string): void;
    send(callback: (err: Error | null, status?: 'pending' | 'sent') => void): void;
    cancel(callback: (err: Error | null) => void): void;
    getUserDetails(callback: (err: Error | null, me?: { escrowDays: number }, them?: { escrowDays: number }) => void): void;
    getExchangeDetails(callback: (err: Error | null, status?: number, initTime?: Date, received?: EconItem[], given?: EconItem[]) => void): void;
  }
  class TradeOfferManager {
    constructor(options: { steam?: SteamUser; community?: SteamCommunity; language?: string; pollInterval?: number });
    createOffer(partner: string): TradeOffer;
    getOffer(id: string, callback: (err: Error | null, offer?: TradeOffer) => void): void;
    getOffers(filter: number, historicalCutoff: Date, callback: (err: Error | null, sent?: TradeOffer[], received?: TradeOffer[]) => void): void;
    getInventoryContents(appid: number, contextid: number, tradableOnly: boolean, callback: (err: Error | null, items?: EconItem[]) => void): void;
    setCookies(cookies: string[], callback: (err: Error | null) => void): void;
    shutdown(): void;
    static ETradeOfferState: Record<string, number>;
    static EOfferFilter: Record<string, number>;
  }
  export default TradeOfferManager;
}

declare module 'steam-totp' {
  const SteamTotp: { generateAuthCode(sharedSecret: string, timeOffset?: number): string };
  export default SteamTotp;
}
