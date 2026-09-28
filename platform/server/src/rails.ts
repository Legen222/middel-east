/**
 * Payment and item rails — interfaces only. In demo mode none of them is wired; the faucet is the only
 * source of balance. Each implementation must be idempotent (keyed by `reference`) and report back through
 * the ledger kinds 'deposit' / 'withdrawal', never by writing balances directly.
 *
 * Why the P2P rail is the default for skins: Valve's API and subscriber terms do not allow operating
 * gambling on Steam trades, and operator-owned trade bots get banned. With a P2P marketplace partner the
 * items move directly between two players on Steam; the platform only ever holds a balance. See
 * docs/platform/04-architektur.md, section "Risiko Steam".
 */

export interface PriceFeed {
  /** Price in Frags for a Rust item, from several sources with outlier filtering. Null if unknown or too illiquid. */
  price(marketHashName: string): Promise<{ frags: number; sources: number; updatedAt: number } | null>;
}

export interface SkinRail {
  /** Lists the player's tradable Rust items with the price the platform would credit. */
  inventory(steamId: string): Promise<{ assetId: string; name: string; frags: number; tradableAt: number | null }[]>;
  /** Starts a deposit; resolves when the trade (or P2P sale) is final. Trade-held items are refused. */
  deposit(userId: string, assetIds: string[], reference: string): Promise<{ status: 'pending' | 'completed' | 'failed'; frags: number }>;
  /** Buys the requested item for the player on the partner market and sends it to their trade URL. */
  withdraw(userId: string, tradeUrl: string, item: string, maxFrags: number, reference: string): Promise<{ status: 'pending' | 'completed' | 'failed'; frags: number }>;
}

export interface CryptoRail {
  depositAddress(userId: string, asset: 'BTC' | 'ETH' | 'LTC' | 'USDT' | 'USDC'): Promise<{ address: string; memo?: string }>;
  /** Payouts go only to addresses that passed screening (sanctions / mixer exposure) by the processor. */
  withdraw(userId: string, asset: string, address: string, frags: number, reference: string): Promise<{ status: 'pending' | 'completed' | 'rejected'; txHash?: string }>;
}

export interface CardRail {
  /** Hosted checkout from a PSP licensed for gambling (MCC 7995); 3-D Secure mandatory. */
  checkout(userId: string, frags: number, reference: string): Promise<{ url: string }>;
}
