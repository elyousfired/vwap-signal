import { CexTicker, VwapData, OHLCV } from '../types';
// Binance Public API (data-api.binance.vision for global access, no geo-block)
const BINANCE_REST_API = 'https://data-api.binance.vision/api/v3/ticker/24hr';
const BINANCE_WS_URL = 'wss://stream.binance.com:9443/ws/!ticker@arr';

// KuCoin Public API (Fallback/Alternative)
const KUCOIN_API = 'https://api.kucoin.com/api/v1/market/allTickers';

let cache: { data: CexTicker[]; ts: number } | null = null;
const CACHE_TTL = 30_000; // 30 seconds for REST fallback

let ws: WebSocket | null = null;
let listeners: ((tickers: CexTicker[]) => void)[] = [];
let tickerSubscriptions: Map<string, ((update: CexTicker) => void)[]> = new Map();

const STABLECOINS = [
    'USDT', 'USDC', 'BUSD', 'DAI', 'FDUSD', 'TUSD', 'EUR', 'TRY', 'GBP',
    'USDP', 'XUSD', 'USDE', 'USDS', 'VAI', 'AEUR', 'ZAR', 'UAH', 'PLN', 'RON', 'USD1'
];

function isStable(symbol: string): boolean {
    return STABLECOINS.includes(symbol.toUpperCase());
}

export async function fetchCexTickers(): Promise<CexTicker[]> {
    if (cache && Date.now() - cache.ts < CACHE_TTL) return cache.data;

    try {
        // Fetch from Binance REST API first (24hr ticker for all symbols)
        const res = await fetch(BINANCE_REST_API);
        if (!res.ok) throw new Error(`Binance API ${res.status}`);

        const data = await res.json();

        // Filter for USDT pairs, exclude stablecoins, and sort by volume
        const tickers: CexTicker[] = data
            .filter((t: any) => t.symbol.endsWith('USDT'))
            .map((t: any) => {
                const baseSymbol = t.symbol.replace('USDT', '');
                if (isStable(baseSymbol)) return null;
                return {
                    id: t.symbol,
                    symbol: baseSymbol,
                    pair: `${baseSymbol}/USDT`,
                    priceUsd: parseFloat(t.lastPrice),
                    priceChange24h: parseFloat(t.priceChange),
                    priceChangePercent24h: parseFloat(t.priceChangePercent),
                    high24h: parseFloat(t.highPrice),
                    low24h: parseFloat(t.lowPrice),
                    volume24h: parseFloat(t.quoteVolume), // This is USDT volume
                    exchange: 'Binance',
                };
            })
            .filter((t: any): t is CexTicker => t !== null)
            .sort((a: CexTicker, b: CexTicker) => b.volume24h - a.volume24h)
            .slice(0, 250); // Top 250 by volume

        cache = { data: tickers, ts: Date.now() };
        return tickers;
    } catch (err) {
        console.error('CEX fetch error (Binance):', err);
        // Fallback to KuCoin if Binance fails
        return fetchKuCoinTickers();
    }
}

async function fetchKuCoinTickers(): Promise<CexTicker[]> {
    try {
        const res = await fetch(KUCOIN_API);
        if (!res.ok) throw new Error(`KuCoin API ${res.status}`);

        const json = await res.json();
        if (json.code !== '200000') throw new Error(`KuCoin error: ${json.msg}`);

        const all = json.data.ticker;
        const tickers: CexTicker[] = all
            .filter((t: any) => t.symbol.endsWith('-USDT'))
            .map((t: any) => {
                const symbol = t.symbol.split('-')[0];
                if (isStable(symbol)) return null;
                return {
                    id: t.symbol,
                    symbol,
                    pair: `${symbol}/USDT`,
                    priceUsd: parseFloat(t.last),
                    priceChange24h: parseFloat(t.changePrice),
                    priceChangePercent24h: parseFloat(t.changeRate) * 100,
                    high24h: parseFloat(t.high),
                    low24h: parseFloat(t.low),
                    volume24h: parseFloat(t.volValue),
                    exchange: 'KuCoin',
                };
            })
            .filter((t: any): t is CexTicker => t !== null)
            .sort((a: CexTicker, b: CexTicker) => b.volume24h - a.volume24h)
            .slice(0, 250);

        cache = { data: tickers, ts: Date.now() };
        return tickers;
    } catch (err) {
        console.error('CEX fetch error (KuCoin):', err);
        return cache?.data || [];
    }
}

/**
 * Initialize WebSocket for real-time updates.
 * This will use Binance's !ticker@arr stream which provides updates for all symbols.
 */
export function initCexWebSocket(onUpdate: (tickers: CexTicker[]) => void) {
    if (!listeners.includes(onUpdate)) {
        listeners.push(onUpdate);
    }

    if (ws && ws.readyState === WebSocket.OPEN) {
        return () => {
            listeners = listeners.filter(l => l !== onUpdate);
        };
    }

    if (ws) ws.close();

    ws = new WebSocket(BINANCE_WS_URL);

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (!Array.isArray(data)) return;

            const updates: CexTicker[] = data
                .filter((t: any) => t.s.endsWith('USDT'))
                .map((t: any) => ({
                    id: t.s,
                    symbol: t.s.replace('USDT', ''),
                    pair: `${t.s.replace('USDT', '')}/USDT`,
                    priceUsd: parseFloat(t.c),
                    priceChange24h: parseFloat(t.p),
                    priceChangePercent24h: parseFloat(t.P),
                    high24h: parseFloat(t.h),
                    low24h: parseFloat(t.l),
                    volume24h: parseFloat(t.q),
                    exchange: 'Binance',
                }));

            // Notify general listeners
            listeners.forEach(callback => callback(updates));

            // Notify specific ticker subscribers
            updates.forEach(update => {
                const subs = tickerSubscriptions.get(update.id);
                if (subs) {
                    subs.forEach(cb => cb(update));
                }
            });

        } catch (err) {
            console.error('WS Message parsing error:', err);
        }
    };

    ws.onerror = (err) => {
        console.error('CEX WS Error:', err);
    };

    ws.onclose = () => {
        console.log('CEX WS Closed. Reconnecting in 5s...');
        ws = null;
        setTimeout(() => {
            if (listeners.length > 0 || tickerSubscriptions.size > 0) {
                // Trigger reconnection by re-initializing with any active listener
                const firstListener = listeners[0];
                if (firstListener) initCexWebSocket(firstListener);
            }
        }, 5000);
    };

    return () => {
        listeners = listeners.filter(l => l !== onUpdate);
        if (listeners.length === 0 && tickerSubscriptions.size === 0 && ws) {
            ws.close();
            ws = null;
        }
    };
}

/**
 * Subscribe to real-time updates for a single ticker.
 */
export function subscribeToTicker(tickerId: string, onUpdate: (update: CexTicker) => void) {
    const subs = tickerSubscriptions.get(tickerId) || [];
    if (!subs.includes(onUpdate)) {
        subs.push(onUpdate);
        tickerSubscriptions.set(tickerId, subs);
    }

    // Ensure WS is running
    if (!ws) {
        initCexWebSocket(() => { });
    }

    return () => {
        const currentSubs = tickerSubscriptions.get(tickerId) || [];
        const nextSubs = currentSubs.filter(s => s !== onUpdate);
        if (nextSubs.length === 0) {
            tickerSubscriptions.delete(tickerId);
        } else {
            tickerSubscriptions.set(tickerId, nextSubs);
        }

        if (listeners.length === 0 && tickerSubscriptions.size === 0 && ws) {
            ws.close();
            ws = null;
        }
    };
}

/**
 * Subscribe to real-time OHLC kline data for a specific symbol and interval.
 */
export function subscribeToKlines(
    symbol: string,
    interval: string,
    onUpdate: (candle: any) => void
) {
    const pair = symbol.toLowerCase().endsWith('usdt') ? symbol.toLowerCase() : `${symbol.toLowerCase()}usdt`;
    const intervalMap: Record<string, string> = {
        '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1d'
    };
    const bInterval = intervalMap[interval] || interval;
    const url = `wss://stream.binance.com:9443/ws/${pair}@kline_${bInterval}`;

    const klineWs = new WebSocket(url);

    klineWs.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.e !== 'kline') return;

            const k = data.k;
            onUpdate({
                time: Math.floor(k.t / 1000),
                open: parseFloat(k.o),
                high: parseFloat(k.h),
                low: parseFloat(k.l),
                close: parseFloat(k.c),
                volume: parseFloat(k.v), // Base volume
                quoteVolume: parseFloat(k.q), // Quote volume (USDT)
                buyVolume: parseFloat(k.Q), // Taker buy quote volume (USDT)
                isFinal: k.x
            });
        } catch (err) {
            console.error('Kline WS parsing error:', err);
        }
    };

    klineWs.onerror = (err) => console.error(`Kline WS Error (${pair}):`, err);

    return () => {
        if (klineWs.readyState === WebSocket.OPEN || klineWs.readyState === WebSocket.CONNECTING) {
            klineWs.close();
        }
    };
}

/**
 * Subscribe to real-time order book (depth) data.
 */
export function subscribeToOrderBook(
    symbol: string,
    onUpdate: (data: { bids: [string, string][], asks: [string, string][] }) => void
) {
    const pair = symbol.toLowerCase().endsWith('usdt') ? symbol.toLowerCase() : `${symbol.toLowerCase()}usdt`;
    const url = `wss://stream.binance.com:9443/ws/${pair}@depth20@100ms`;

    const depthWs = new WebSocket(url);

    depthWs.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            onUpdate({
                bids: data.bids,
                asks: data.asks
            });
        } catch (err) {
            console.error('OrderBook WS parsing error:', err);
        }
    };

    depthWs.onerror = (err) => console.error(`OrderBook WS Error (${pair}):`, err);

    return () => {
        if (depthWs.readyState === WebSocket.OPEN || depthWs.readyState === WebSocket.CONNECTING) {
            depthWs.close();
        }
    };
}


/**
 * Fetch historical OHLCV data from Binance for charting.
 */
export async function fetchBinanceKlines(
    symbol: string,
    interval: string = '15m',
    limit: number = 100
): Promise<OHLCV[]> {
    // Map application intervals to Binance intervals
    const intervalMap: Record<string, string> = {
        '1m': '1m',
        '5m': '5m',
        '15m': '15m',
        '1h': '1h',
        '4h': '4h',
        '1d': '1d',
    };

    const binanceInterval = intervalMap[interval] || interval;
    const pair = symbol.endsWith('USDT') ? symbol : `${symbol}USDT`;
    const url = `https://data-api.binance.vision/api/v3/klines?symbol=${pair}&interval=${binanceInterval}&limit=${limit}`;

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Binance Klines API ${res.status}`);

        const data = await res.json();

        // Binance format: [openTime, open, high, low, close, volume, closeTime, quoteAssetVolume, ...]
        return data.map((d: any) => ({
            time: Math.floor(d[0] / 1000),
            open: parseFloat(d[1]),
            high: parseFloat(d[2]),
            low: parseFloat(d[3]),
            close: parseFloat(d[4]),
            volume: parseFloat(d[5]), // Base volume (e.g. BTC)
            quoteVolume: parseFloat(d[7]), // Quote volume (e.g. USDT)
            buyVolume: parseFloat(d[10]) // Taker buy quote volume (USDT)
        }));
    } catch (err) {
        console.error('Binance Klines fetch error:', err);
        return [];
    }
}


/**
 * Fetch historical 1D klines and calculate structural Weekly Max, Weekly Min, and Current Mid VWAP.
 * 
 * Logic:
 * - Calculates once per UTC day (at 00:00 UTC when a new daily candle opens).
 * - Freezes the Weekly VWAP (Max/Min) for the rest of the day.
 * - Only recalculates when a new UTC day is detected.
 * - Max/Min use COMPLETED daily candles only (structural levels).
 * - Mid reflects the current (live) day's VWAP.
 */

// Standard cache with short TTL for live updates
const vwapCache: Map<string, { data: VwapData, expires: number }> = new Map();
const VWAP_CACHE_TTL = 1000 * 60 * 1; // 1 minute for fresh slope/mid values

export async function fetchWeeklyVwapData(symbol: string): Promise<VwapData | null> {
    const cached = vwapCache.get(symbol);
    if (cached && cached.expires > Date.now()) return cached.data;

    // Fetch 30 days to have enough for ATR(14) + Slope Lookback(10)
    const klines = await fetchBinanceKlines(symbol, '1d', 30);
    if (klines.length < 15) return null;

    // Monday 00:00 UTC boundary
    const now = new Date();
    const dayOfWeek = now.getUTCDay(); // 0 = Sunday
    const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(now);
    monday.setUTCHours(0, 0, 0, 0);
    monday.setUTCDate(now.getUTCDate() - diffToMonday);
    const mondayTs = Math.floor(monday.getTime() / 1000);

    let wMax = -Infinity;
    let wMin = Infinity;
    let currentMid = 0;

    // Calculate Daily VWAP values for all klines
    const rawVwap = klines.map(k => (k.volume > 0 ? k.quoteVolume / k.volume : (k.high + k.low + k.close) / 3));

    klines.forEach((k, index) => {
        const dailyVwap = rawVwap[index];
        const isCompletedDay = index < klines.length - 1;
        const isSinceMonday = k.time >= mondayTs;

        // Max/Min: only from COMPLETED daily candles since Monday (structural levels)
        if (isSinceMonday && isCompletedDay) {
            if (dailyVwap > wMax) wMax = dailyVwap;
            if (dailyVwap < wMin) wMin = dailyVwap;
        }

        // Mid: live VWAP of the current (active) day
        if (index === klines.length - 1) {
            currentMid = dailyVwap;
        }
    });

    // Slope Calculation (Lookback 10, ATR 14 normalization)
    const SLOPE_LOOKBACK = 10;
    const ATR_LENGTH = 14;

    // ATR calculation
    const trueRanges: number[] = klines.map((d, i) => {
        if (i === 0) return d.high - d.low;
        const prevClose = klines[i - 1].close;
        return Math.max(d.high - d.low, Math.abs(d.high - prevClose), Math.abs(d.low - prevClose));
    });

    let currentAtr = 0;
    const last14TR = trueRanges.slice(-ATR_LENGTH);
    if (last14TR.length === ATR_LENGTH) {
        currentAtr = last14TR.reduce((s, v) => s + v, 0) / ATR_LENGTH;
    }

    const lastIdx = klines.length - 1;
    let slope = 0;
    let normalizedSlope = 0;

    if (lastIdx >= SLOPE_LOOKBACK) {
        slope = currentMid - rawVwap[lastIdx - SLOPE_LOOKBACK];
        normalizedSlope = currentAtr > 0 ? slope / currentAtr : 0;
    }

    // Fallback: if no completed days this week yet (e.g. Monday), use current mid
    if (wMax === -Infinity) wMax = currentMid;
    if (wMin === Infinity) wMin = currentMid;

    const vwapData: VwapData = {
        max: wMax,
        min: wMin,
        mid: currentMid,
        slope,
        normalizedSlope,
        symbol
    };

    vwapCache.set(symbol, { data: vwapData, expires: Date.now() + VWAP_CACHE_TTL });
    return vwapData;
}

export function formatLargeNumber(n: number): string {
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return n.toFixed(2);
}


export function getTodayStartUTC(): number {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return d.getTime();
}

export function getMondayStartUTC(): number {
    const d = new Date();
    const day = d.getUTCDay(); // 0 is Sunday, 1 is Monday...
    const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setUTCDate(diff));
    monday.setUTCHours(0, 0, 0, 0);
    return monday.getTime();
}

export function formatPrice(price: number): string {
    if (price >= 1000) return price.toLocaleString('en-US', { maximumFractionDigits: 2 });
    if (price >= 1) return price.toFixed(2);
    if (price >= 0.001) return price.toFixed(4);
    return price.toFixed(8);
}

export interface CorrelationStats {
    followerScore: number; // % of days signs match
    hedgeScore: number;    // % of days BTC down & Token up
    outperformScore: number; // % of days Token > BTC
}

export async function calculateHistoricalCorrelation(symbol: string, btcKlines?: OHLCV[]): Promise<CorrelationStats | null> {
    const btcData = btcKlines || await fetchBinanceKlines('BTC', '1d', 14);
    const tokenKlines = await fetchBinanceKlines(symbol, '1d', 14);

    if (btcData.length < 7 || tokenKlines.length < 7) return null;

    let followerCount = 0;
    let hedgeCount = 0;
    let outperformCount = 0;
    let btcDownDays = 0;

    // We compare matching times
    const commonLength = Math.min(btcData.length, tokenKlines.length);
    for (let i = 1; i < commonLength; i++) {
        const btcPrev = btcData[i - 1].close;
        const btcCurr = btcData[i].close;
        const tokenPrev = tokenKlines[i - 1].close;
        const tokenCurr = tokenKlines[i].close;

        const btcChange = (btcCurr - btcPrev) / btcPrev;
        const tokenChange = (tokenCurr - tokenPrev) / tokenPrev;

        if (Math.sign(btcChange) === Math.sign(tokenChange)) followerCount++;
        if (tokenChange > btcChange) outperformCount++;

        if (btcChange < 0) {
            btcDownDays++;
            if (tokenChange > 0) hedgeCount++;
        }
    }

    const totalDays = commonLength - 1;
    return {
        followerScore: (followerCount / totalDays) * 100,
        hedgeScore: btcDownDays > 0 ? (hedgeCount / btcDownDays) * 100 : 0,
        outperformScore: (outperformCount / totalDays) * 100
    };
}
