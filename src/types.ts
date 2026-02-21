
export interface DexBoostedToken {
  url: string;
  chainId: string;
  tokenAddress: string;
  amount: number;
  totalAmount: number;
  icon?: string;
  header?: string;
  description?: string;
  links?: { type?: string; url?: string }[];
}

export interface DexPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: {
    address: string;
    name: string;
    symbol: string;
  };
  priceUsd?: string;
  liquidity?: {
    usd?: number;
    base?: number;
    quote?: number;
  };
  volume?: {
    h24?: number;
    h6?: number;
    h1?: number;
    m5?: number;
  };
  pairCreatedAt?: number;
}

export interface NormalizedTokenItem {
  id: string;
  chainId: string;
  tokenAddress: string;
  pairAddress: string;
  symbol: string;
  name: string;
  priceUsd: number | null;
  liquidityUsd: number | null;
  volume24h: number | null;
  url: string;
  icon?: string;
  ageInHours: number | null;
  rawBoost: DexBoostedToken;
}

// ─── Token Scanner Agent Types ──────────────────────────────

export type ScanStatus = 'pending' | 'scanning' | 'safe' | 'warning' | 'danger';

export interface TokenSecurityInfo {
  isHoneypot: boolean | null;
  hasMintAuthority: boolean | null;
  hasFreezeAuthority: boolean | null;
  isOpenSource: boolean | null;
  topHolderPercent: number | null;
  creatorPercent: number | null;
  lpLocked: boolean | null;
  buyTax: number | null;
  sellTax: number | null;
  rawData?: Record<string, any>;
}

export interface TokenScanResult {
  token: NormalizedTokenItem;
  security: TokenSecurityInfo | null;
  riskScore: number; // 0 (safe) → 100 (danger)
  scanStatus: ScanStatus;
  aiVerdict: string | null;
  scannedAt: number;
}

export interface AgentLog {
  id: string;
  timestamp: number;
  type: 'info' | 'scan' | 'warning' | 'danger' | 'success';
  message: string;
  tokenSymbol?: string;
}

export type SortField = 'riskScore' | 'liquidityUsd' | 'volume24h' | 'ageInHours';
export type SortOrder = 'asc' | 'desc';

export interface FilterState {
  liquidityMin: string;
  liquidityMax: string;
  volumeMin: string;
  volumeMax: string;
  maxAgeHours: string;
  chain: string; // 'all' | 'solana' | 'ethereum' | 'bsc' | 'base'
  riskLevel: string; // 'all' | 'safe' | 'warning' | 'danger'
}

// ─── CEX Ticker Types ───────────────────────────────────────

export interface CexTicker {
  id: string;
  symbol: string;
  pair: string;
  priceUsd: number;
  priceChange24h: number;
  priceChangePercent24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  trades24h?: number;
  exchange: string;
}


export interface WatchlistTrade {
  id: string; // trade uuid
  symbol: string;
  entryPrice: number;
  entryTime: number;
  amount: number; // simulated USD amount
  status: 'open' | 'closed';
  closePrice?: number;
  closeTime?: number;
}

export interface OHLCV {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolume: number;
  buyVolume: number;
}

export interface VwapData {
  max: number;
  min: number;
  mid: number;
  slope: number;
  normalizedSlope: number;
  symbol: string;
}
