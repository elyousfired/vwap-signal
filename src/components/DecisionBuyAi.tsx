
import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { FC } from 'react';
import type { CexTicker, VwapData } from '../types';
import { formatPrice } from '../services/cexService';
import { Brain, Star, TrendingUp, TrendingDown, ArrowRight, Zap, Trophy, ShieldCheck, Settings, Send, CheckCircle, XCircle, Volume2, VolumeX, Timer, Target, RefreshCcw } from 'lucide-react';
import { sendGoldenSignalAlert, loadTelegramConfig, saveTelegramConfig, sendTestAlert } from '../services/telegramService';
import type { TelegramConfig } from '../services/telegramService';

// ─── Golden Signal Tracker Types ───────────────
interface TrackedGolden {
    symbol: string;
    entryPrice: number;
    signalTime: number;
    maxPrice: number;
    maxGainPct: number;
    lastPrice: number;
    stillActive: boolean;
    history?: number[];
    exitPrice?: number;
    exitTime?: number;
    realizedPnl?: number;
    wasActive?: boolean; // Added to distinguish between 'not yet golden' and 'exhausted golden'
}

const GOLDEN_TRACKER_KEY = 'dexpulse_golden_tracker';
const TRACKER_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

function loadTrackedGoldens(): TrackedGolden[] {
    try {
        const raw = localStorage.getItem(GOLDEN_TRACKER_KEY);
        if (!raw) return [];
        const data: TrackedGolden[] = JSON.parse(raw);
        // Auto-expire entries older than 24h
        const now = Date.now();
        return data.filter(t => now - t.signalTime < TRACKER_EXPIRY_MS);
    } catch { return []; }
}

function saveTrackedGoldens(data: TrackedGolden[]) {
    const now = Date.now();
    const filtered = data.filter(t => now - t.signalTime < TRACKER_EXPIRY_MS);
    localStorage.setItem(GOLDEN_TRACKER_KEY, JSON.stringify(filtered));
}

interface DecisionBuyAiProps {
    tickers: CexTicker[];
    vwapStore: Record<string, VwapData>;
    firstSeenTimes: Record<string, number>;
    isLoading: boolean;
    onTickerClick: (ticker: CexTicker) => void;
    onAddToWatchlist: (ticker: CexTicker) => void;
}

interface BuySignal {
    ticker: CexTicker;
    vwap: VwapData;
    score: number;
    reason: string;
    type: 'GOLDEN' | 'MOMENTUM' | 'SUPPORT' | 'EXIT';
    activeSince?: number; // timestamp
}

// ─── Memoized Signal Card ─────────────────
interface SignalCardProps {
    sig: BuySignal;
    currentTime: number;
    onTickerClick: (ticker: CexTicker) => void;
    onAddToWatchlist: (ticker: CexTicker) => void;
}

const SignalCard = React.memo<SignalCardProps>(({ sig, currentTime, onTickerClick, onAddToWatchlist }) => (
    <button
        onClick={() => onTickerClick(sig.ticker)}
        className="group glass-card rounded-[2rem] p-7 flex flex-col text-left relative overflow-hidden"
    >
        <div className="absolute top-0 right-0 w-32 h-32 bg-purple-600/5 blur-3xl rounded-full group-hover:bg-purple-600/15 transition-all duration-700"></div>
        <div className="flex items-start justify-between mb-8 relative z-10">
            <div className="flex items-center gap-5">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl shadow-2xl transition-all duration-500 group-hover:rotate-6 ${sig.type === 'GOLDEN' ? 'bg-gradient-to-br from-amber-400 to-orange-600 text-black shadow-amber-500/20' :
                    sig.type === 'MOMENTUM' ? 'bg-gradient-to-br from-purple-500 to-indigo-700 text-white shadow-purple-500/20' :
                        'bg-gradient-to-br from-blue-500 to-cyan-700 text-white'
                    }`}>
                    {sig.ticker.symbol[0]}
                </div>
                <div>
                    <h3 className="text-xl font-black text-white group-hover:text-purple-400 transition-colors uppercase tracking-tight flex items-center gap-2">
                        {sig.ticker.symbol}
                        <span className="text-[10px] text-white/20 font-bold tracking-widest italic group-hover:text-purple-400/40">USDT</span>
                    </h3>
                    <div className="mt-1 flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${sig.type === 'GOLDEN' ? 'bg-amber-500' : 'bg-purple-500'}`}></div>
                        <span className={`text-[9px] font-black uppercase tracking-[0.1em] ${sig.type === 'GOLDEN' ? 'text-amber-500' : 'text-purple-400'}`}>
                            {sig.type} SIGNAL ACTIVE
                        </span>
                    </div>
                </div>
            </div>
            <div className="flex flex-col items-end">
                <div className="flex items-center gap-2.5 px-3 py-1.5 bg-white/5 border border-white/10 rounded-xl group-hover:border-purple-500/30 transition-colors">
                    <Trophy className={`w-4 h-4 ${sig.score > 90 ? 'text-amber-500' : 'text-purple-400'}`} />
                    <span className="text-2xl font-black text-white italic tracking-tighter">{sig.score.toFixed(0)}</span>
                </div>
                {sig.activeSince && (
                    <span className="text-[9px] font-bold text-white/20 mt-1.5 uppercase tracking-tighter">
                        ⏱️ {Math.floor((currentTime - sig.activeSince) / 1000 / 60)}m {Math.floor((currentTime - sig.activeSince) / 1000) % 60}s
                    </span>
                )}
            </div>
        </div>
        <div className="bg-white/[0.03] rounded-2xl p-5 border border-white/[0.04] mb-8 group-hover:bg-white/[0.05] transition-all relative z-10">
            <div className="flex items-center gap-2.5 mb-2.5">
                <ShieldCheck className="w-4 h-4 text-purple-400" />
                <span className="text-[9px] font-black text-white/40 uppercase tracking-[0.2em]">AI Intelligence Verdict</span>
            </div>
            <p className="text-sm text-white/70 leading-relaxed font-medium line-clamp-2 italic">
                "{sig.reason}"
            </p>
        </div>
        <div className="grid grid-cols-3 gap-6 mb-8 relative z-10">
            <div className="flex flex-col gap-1.5">
                <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Mark Price</span>
                <span className="text-base font-black text-white tracking-tight">${formatPrice(sig.ticker.priceUsd)}</span>
            </div>
            <div className="flex flex-col gap-1.5">
                <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Bull Target</span>
                <span className="text-base font-black text-emerald-400 tracking-tight">${formatPrice(sig.vwap.max)}</span>
            </div>
            <div className="flex flex-col gap-1.5">
                <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Risk Guard</span>
                <span className="text-base font-black text-rose-500/80 tracking-tight">${formatPrice(sig.vwap.mid)}</span>
            </div>
        </div>
        <div className="mt-auto pt-6 border-t border-white/[0.05] flex items-center justify-between relative z-10">
            <button
                onClick={(e) => { e.stopPropagation(); onAddToWatchlist(sig.ticker); }}
                className="px-4 py-2 hover:bg-white/5 text-white/40 hover:text-white rounded-xl text-[9px] font-black tracking-widest transition-all flex items-center gap-2.5 border border-transparent hover:border-white/10"
            >
                <Star className="w-3.5 h-3.5 transition-transform group-hover:scale-110" />
                WATCHLIST
            </button>
            <div className="flex items-center gap-2 bg-purple-500/5 px-4 py-2 rounded-xl group-hover:bg-purple-500/10 transition-all border border-purple-500/10">
                <span className="text-xs font-black text-purple-400 tracking-wide uppercase italic">Analyze</span>
                <ArrowRight className="w-4 h-4 text-purple-400 translate-x-0 group-hover:translate-x-1 transition-transform" />
            </div>
        </div>
    </button>
));

// ─── Memoized Performance Row ───────────────
const PerformanceRow = React.memo<{ t: TrackedGolden, currentTime: number }>(({ t, currentTime }) => {
    const isClosed = !!t.exitTime;
    const pnl = isClosed ? (t.realizedPnl || 0) : (((t.lastPrice - t.entryPrice) / t.entryPrice) * 100);
    const elapsed = (isClosed ? t.exitTime! : currentTime) - t.signalTime;
    const hoursAgo = Math.floor(elapsed / 3600000);
    const minsAgo = Math.floor((elapsed % 3600000) / 60000);
    const isPositive = pnl >= 0;

    const history = t.history || [t.entryPrice, t.lastPrice];
    const minPrice = Math.min(...history);
    const maxPrice = Math.max(...history);
    const range = (maxPrice - minPrice) || (t.entryPrice * 0.01);
    const points = history.map((p, i) => {
        const x = (i / Math.max(1, history.length - 1)) * 100;
        const y = 30 - ((p - minPrice) / range) * 25;
        return `${x},${y}`;
    }).join(' ');

    return (
        <div className={`flex items-center gap-5 p-4 rounded-2xl border transition-all group/row ${isClosed ? 'bg-black/40 border-white/[0.02] opacity-80 hover:opacity-100' : 'bg-white/[0.02] border-white/[0.04] hover:border-white/[0.08] hover:bg-white/[0.04]'}`}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm shrink-0 shadow-lg ${t.stillActive ? 'bg-white text-black' : isClosed ? 'bg-purple-900/40 text-purple-300' : 'bg-white/10 text-white/30'}`}>
                {t.symbol[0]}
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-3">
                        <span className="text-sm font-black text-white uppercase tracking-tight italic">{t.symbol}</span>
                        {t.stillActive && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>}
                        {isClosed && <span className="text-[7px] bg-white/5 px-1.5 py-0.5 rounded border border-white/10 text-white/40 font-black tracking-widest uppercase">REALIZED</span>}
                    </div>
                    <span className="text-[8px] text-white/20 font-black uppercase tracking-widest">
                        {isClosed ? 'Trade Duration: ' : ''}{hoursAgo > 0 ? `${hoursAgo}H ` : ''}{minsAgo}M
                    </span>
                </div>

                <div className="flex items-center gap-5">
                    <div className="flex flex-col">
                        <span className="text-[8px] text-white/20 font-black uppercase tracking-widest">Entry</span>
                        <span className="text-[11px] text-white/80 font-mono font-bold">${formatPrice(t.entryPrice)}</span>
                    </div>
                    {!isClosed && (
                        <div className="flex-1 h-[25px] relative group/spark">
                            <svg width="100%" height="25" viewBox="0 0 100 30" preserveAspectRatio="none" className="overflow-visible">
                                <polyline
                                    points={points}
                                    fill="none"
                                    stroke={isPositive ? '#10b981' : '#f43f5e'}
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    className="opacity-60 group-hover/spark:opacity-100 transition-opacity"
                                />
                            </svg>
                        </div>
                    )}
                    {isClosed && (
                        <div className="flex-1 flex items-center justify-center gap-2">
                            <div className="h-px bg-white/5 flex-1"></div>
                            <XCircle className="w-3 h-3 text-white/20" />
                            <div className="h-px bg-white/5 flex-1"></div>
                        </div>
                    )}
                    <div className="flex flex-col text-right">
                        <span className="text-[8px] text-white/20 font-black uppercase tracking-widest">{isClosed ? 'Exit' : 'Latest'}</span>
                        <span className={`text-[11px] font-mono font-bold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>${formatPrice(isClosed ? t.exitPrice! : t.lastPrice)}</span>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-6 pl-6 border-l border-white/5">
                <div className="text-right">
                    <div className="text-[8px] font-black text-white/20 uppercase tracking-widest">P&L</div>
                    <div className={`text-lg font-black italic tracking-tighter ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isPositive ? '+' : ''}{pnl.toFixed(1)}%
                    </div>
                </div>
            </div>
        </div>
    );
});

export const DecisionBuyAi: FC<DecisionBuyAiProps> = ({
    tickers,
    vwapStore,
    firstSeenTimes,
    isLoading,
    onTickerClick,
    onAddToWatchlist
}) => {
    const [showSettings, setShowSettings] = useState(false);
    const [tgConfig, setTgConfig] = useState<TelegramConfig>(loadTelegramConfig);
    const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'ok' | 'fail'>('idle');
    const [_alertCount, setAlertCount] = useState(0);
    const [audioEnabled, setAudioEnabled] = useState(() => {
        const saved = localStorage.getItem('dexpulse_audio_alerts');
        return saved ? saved === 'true' : true;
    });
    const [sortBy, setSortBy] = useState<'score' | 'time'>('score');
    const alertedRef = useRef<Set<string>>(new Set());
    const exitAlertedRef = useRef<Set<string>>(new Set());
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [currentTime, setCurrentTime] = useState(Date.now());
    const [trackedGoldens, setTrackedGoldens] = useState<TrackedGolden[]>(loadTrackedGoldens);

    const playAlarm = () => {
        if (!audioEnabled || !audioRef.current) return;
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(e => console.warn("Audio play blocked by browser. Interaction required.", e));
    };

    // Live timer update
    useEffect(() => {
        const interval = setInterval(() => setCurrentTime(Date.now()), 1000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        audioRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
        audioRef.current.volume = 0.5;
    }, []);

    useEffect(() => {
        localStorage.setItem('dexpulse_audio_alerts', audioEnabled.toString());
    }, [audioEnabled]);

    const signals = useMemo(() => {
        return tickers.map(t => {
            const vwap = vwapStore[t.id];
            if (!vwap) return null;

            const price = t.priceUsd;
            let signal: BuySignal | null = null;
            const isMonday = new Date().getUTCDay() === 1;

            // Trend strength (0.05 threshold same as chart coloring)
            const isVwapPositive = vwap.normalizedSlope > 0.05;
            const isVwapNegative = vwap.normalizedSlope < -0.05;

            // ─── GOLDEN SIGNAL LOGIC ───
            // Requirement: Price > Max && Daily VWAP Slope is Positive
            const isPriceAboveMax = price > vwap.max;

            if (isPriceAboveMax && isVwapPositive) {
                signal = {
                    ticker: t,
                    vwap,
                    score: 95 + Math.min(5, vwap.normalizedSlope * 20),
                    reason: isMonday
                        ? "Monday Golden: Price above Weekly Max with strong positive trend. High probability start."
                        : "Golden Breakout: Price holding above Weekly Max with confirmed positive momentum.",
                    activeSince: firstSeenTimes[t.id] || Date.now(),
                    type: 'GOLDEN'
                };
            }
            // ──── EXIT SIGNAL ────
            else if (isVwapNegative) {
                signal = {
                    ticker: t,
                    vwap,
                    score: 90, // "Exit priority"
                    reason: "VWAP Trend reversal. Daily slope turned negative. High risk of redistribution.",
                    type: 'EXIT'
                };
            }
            // 2. MOMENTUM PUSH: Price > Mid && Price < Max && Trend positive
            else if (price > vwap.mid && price < vwap.max && isVwapPositive) {
                signal = {
                    ticker: t,
                    vwap,
                    score: 85 + Math.min(10, vwap.normalizedSlope * 10),
                    reason: "Momentum buildup. Trend is positive and approaching Weekly Max resistance.",
                    type: 'MOMENTUM'
                };
            }
            // 3. SUPPORT BOUNCE: Price approx Mid && Pos trend
            else if (Math.abs(price - vwap.mid) / vwap.mid < 0.02 && isVwapPositive) {
                signal = {
                    ticker: t,
                    vwap,
                    score: 80,
                    reason: "Bouncing off Weekly Mid support with positive daily trend confirmation.",
                    type: 'SUPPORT'
                };
            }

            return signal;
        })
            .filter((s): s is BuySignal => s !== null)
            .sort((a, b) => {
                // EXITs always first
                if (a.type === 'EXIT' && b.type !== 'EXIT') return -1;
                if (b.type === 'EXIT' && a.type !== 'EXIT') return 1;

                if (sortBy === 'time') {
                    const aTime = a.activeSince || 0;
                    const bTime = b.activeSince || 0;
                    return bTime - aTime; // Newest first
                }
                return b.score - a.score;
            });
    }, [tickers, vwapStore, firstSeenTimes, sortBy]);

    // Filtered signals for UI display (Show only GOLDEN Entry signals)
    const displaySignals = useMemo(() => {
        return signals.filter((s: BuySignal) => s.type === 'GOLDEN');
    }, [signals]);

    // ─── Telegram Alert Trigger ───────────────────
    useEffect(() => {
        if (!tgConfig.enabled) return;

        const allActiveSymbols = new Set(signals.map((s: BuySignal) => s.ticker.symbol));

        let sent = 0;
        signals.forEach((sig: BuySignal) => {
            const symbol = sig.ticker.symbol;

            if (sig.type === 'GOLDEN') {
                if (!alertedRef.current.has(symbol)) {
                    sendGoldenSignalAlert({
                        symbol,
                        price: sig.ticker.priceUsd,
                        change24h: sig.ticker.priceChangePercent24h,
                        score: sig.score,
                        vwapMax: sig.vwap.max,
                        vwapMid: sig.vwap.mid,
                        reason: sig.reason,
                        type: sig.type
                    });
                    playAlarm();
                    alertedRef.current.add(symbol);
                    exitAlertedRef.current.delete(symbol); // Reset exit alert if it becomes golden again
                    sent++;
                }
            } else if (sig.type === 'EXIT') {
                if (!exitAlertedRef.current.has(symbol)) {
                    sendGoldenSignalAlert({
                        symbol,
                        price: sig.ticker.priceUsd,
                        change24h: sig.ticker.priceChangePercent24h,
                        score: sig.score,
                        vwapMax: sig.vwap.max,
                        vwapMid: sig.vwap.mid,
                        reason: sig.reason,
                        type: 'EXIT'
                    });
                    // Only play alarm for EXIT if it was previously a known positive signal
                    if (alertedRef.current.has(symbol)) playAlarm();

                    exitAlertedRef.current.add(symbol);
                    alertedRef.current.delete(symbol);
                    sent++;
                }
            } else {
                // Not golden or exit: if it was alerted before, clear it so it can re-trigger
                if (alertedRef.current.has(symbol)) {
                    alertedRef.current.delete(symbol);
                }
            }
        });

        // Cleanup: tokens that completely fell out of signals
        const cleanupList = [alertedRef, exitAlertedRef];
        cleanupList.forEach((ref: React.MutableRefObject<Set<string>>) => {
            ref.current.forEach((symbol: string) => {
                if (!allActiveSymbols.has(symbol)) {
                    ref.current.delete(symbol);
                }
            });
        });

        if (sent > 0) setAlertCount(prev => prev + sent);
    }, [signals, tgConfig.enabled, audioEnabled]);

    // ─── Golden Signal Tracker: record + update ───
    useEffect(() => {
        const goldenSignals = signals.filter(s => s.type === 'GOLDEN');
        const goldenSymbols = new Set(goldenSignals.map(s => s.ticker.symbol));

        setTrackedGoldens(prev => {
            let updated = [...prev];

            // 1. Add new golden signals not yet tracked
            goldenSignals.forEach((sig: BuySignal) => {
                const existing = updated.find((t: TrackedGolden) => t.symbol === sig.ticker.symbol);
                if (!existing) {
                    updated.push({
                        symbol: sig.ticker.symbol,
                        entryPrice: sig.ticker.priceUsd,
                        signalTime: sig.activeSince || Date.now(),
                        maxPrice: sig.ticker.priceUsd,
                        maxGainPct: 0,
                        lastPrice: sig.ticker.priceUsd,
                        stillActive: true,
                        wasActive: true,
                        history: [sig.ticker.priceUsd]
                    });
                } else if (!existing.stillActive && !existing.exitTime) {
                    // Re-activate if it was just waiting/fresh and didn't close yet
                    existing.stillActive = true;
                    existing.wasActive = true;
                }
            });

            // 2. Update all tracked entries with current prices
            updated = updated.map((t: TrackedGolden) => {
                // If already closed, don't update lastPrice or PnL
                if (t.exitTime) return t;

                const ticker = tickers.find((tk: CexTicker) => tk.symbol === t.symbol);
                if (!ticker) return t;

                const isCurrentlyGolden = goldenSymbols.has(t.symbol);
                const currentPrice = ticker.priceUsd;

                // Detect EXIT: was active golden, but now is not
                if (t.stillActive && !isCurrentlyGolden) {
                    const finalPnl = ((currentPrice - t.entryPrice) / t.entryPrice) * 100;
                    return {
                        ...t,
                        lastPrice: currentPrice,
                        stillActive: false,
                        exitPrice: currentPrice,
                        exitTime: Date.now(),
                        realizedPnl: finalPnl,
                        maxPrice: Math.max(t.maxPrice, currentPrice),
                        maxGainPct: Math.max(t.maxGainPct, finalPnl)
                    };
                }

                const pnl = ((currentPrice - t.entryPrice) / t.entryPrice) * 100;
                const newMax = Math.max(t.maxPrice, currentPrice);
                const newMaxGain = Math.max(t.maxGainPct, pnl);

                // Update history every 10 minutes
                const history = t.history || [t.entryPrice];
                const shouldAddPoint = history.length < 144 && (Date.now() - (t.signalTime + (history.length - 1) * 10 * 60 * 1000) > 10 * 60 * 1000);

                return {
                    ...t,
                    lastPrice: currentPrice,
                    maxPrice: newMax,
                    maxGainPct: newMaxGain,
                    stillActive: isCurrentlyGolden,
                    history: shouldAddPoint ? [...history, currentPrice] : history
                };
            });

            // 3. Filter expired (>24h)
            const now = Date.now();
            updated = updated.filter(t => now - t.signalTime < TRACKER_EXPIRY_MS);

            saveTrackedGoldens(updated);
            return updated;
        });
    }, [signals, tickers]);

    const handleSaveConfig = (config: TelegramConfig) => {
        saveTelegramConfig(config);
        setTgConfig(config);
    };

    const handleTestAlert = async () => {
        setTestStatus('sending');
        const ok = await sendTestAlert(tgConfig);
        setTestStatus(ok ? 'ok' : 'fail');
        setTimeout(() => setTestStatus('idle'), 3000);
    };

    if (isLoading && Object.keys(vwapStore).length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-32 text-gray-500 gap-8">
                <div className="relative">
                    <div className="absolute inset-0 bg-purple-500/20 blur-3xl rounded-full animate-pulse-slow"></div>
                    <Brain className="w-20 h-20 text-purple-500/40 relative z-10" />
                </div>
                <div className="flex flex-col items-center gap-2">
                    <p className="text-sm font-black tracking-[0.4em] text-white/40 uppercase italic">Neural Network Mapping Market Signals</p>
                    <div className="w-48 h-1 bg-white/5 rounded-full overflow-hidden">
                        <div className="w-1/3 h-full bg-gradient-to-r from-purple-600 to-blue-600 animate-[loading_2s_infinite]"></div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-transparent overflow-hidden">
            {/* AI Sub-Header/Filters */}
            <div className="px-8 py-6 border-b border-white/[0.03] flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center gap-6">
                    <div className="flex items-center bg-black/40 rounded-2xl p-1.5 border border-white/[0.05] shadow-inner">
                        <button
                            onClick={() => setSortBy('score')}
                            className={`px-5 py-2 rounded-xl text-[10px] font-black tracking-widest transition-all flex items-center gap-2.5 ${sortBy === 'score' ? 'bg-purple-600 text-white shadow-[0_0_20px_rgba(168,85,247,0.4)]' : 'text-white/40 hover:text-white/70'
                                }`}
                        >
                            <Trophy className="w-3.5 h-3.5" />
                            TOP SCORE
                        </button>
                        <button
                            onClick={() => setSortBy('time')}
                            className={`px-5 py-2 rounded-xl text-[10px] font-black tracking-widest transition-all flex items-center gap-2.5 ${sortBy === 'time' ? 'bg-purple-600 text-white shadow-[0_0_20px_rgba(168,85,247,0.4)]' : 'text-white/40 hover:text-white/70'
                                }`}
                        >
                            <Timer className="w-3.5 h-3.5" />
                            NEWEST
                        </button>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-3 pr-4 border-r border-white/10">
                        <div className="text-right">
                            <span className="block text-[8px] font-black text-white/20 uppercase tracking-widest leading-none">Alerts</span>
                            <span className="text-sm font-black text-purple-400 italic">#{_alertCount} Today</span>
                        </div>
                        <button
                            onClick={() => setAudioEnabled(!audioEnabled)}
                            className={`w-10 h-10 rounded-xl border transition-all flex items-center justify-center ${audioEnabled ? 'bg-purple-500/10 border-purple-500/30 text-purple-400' : 'bg-white/5 border-white/10 text-white/20 hover:text-white/40'}`}
                        >
                            {audioEnabled ? <Volume2 className="w-4 h-4 shadow-sm" /> : <VolumeX className="w-4 h-4" />}
                        </button>
                    </div>

                    <button onClick={() => setShowSettings(!showSettings)}
                        className={`w-12 h-12 rounded-2xl border transition-all flex items-center justify-center ${showSettings ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}>
                        <Settings className={`w-5 h-5 ${showSettings ? 'animate-spin-slow' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Telegram Settings Panel - Premium Slide Down */}
            {showSettings && (
                <div className="mx-8 mt-6 p-8 glass-card rounded-3xl border border-purple-500/20 animate-in fade-in slide-in-from-top-4 duration-500">
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                                <Send className="w-6 h-6 text-purple-400" />
                            </div>
                            <div>
                                <h3 className="text-sm font-black text-white uppercase tracking-[0.2em]">Telegram Integration</h3>
                                <p className="text-[10px] text-white/30 font-bold uppercase">Real-time signal synchronization</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <label className="flex items-center gap-4 cursor-pointer group bg-black/40 px-5 py-3 rounded-2xl border border-white/5">
                                <span className="text-[10px] font-black text-white/40 uppercase tracking-widest group-hover:text-white transition-colors">{tgConfig.enabled ? 'Push Active' : 'Push Disabled'}</span>
                                <div className={`w-12 h-6 rounded-full relative transition-all duration-300 ${tgConfig.enabled ? 'bg-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.5)]' : 'bg-white/10'}`}
                                    onClick={() => handleSaveConfig({ ...tgConfig, enabled: !tgConfig.enabled })}>
                                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all duration-300 shadow-lg ${tgConfig.enabled ? 'left-7' : 'left-1'}`}></div>
                                </div>
                            </label>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                        <div className="space-y-2">
                            <label className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">Bot Authentication Token</label>
                            <div className="relative group">
                                <input type="password" placeholder="•••••••••••••••••••••••••••••" value={tgConfig.botToken}
                                    onChange={e => handleSaveConfig({ ...tgConfig, botToken: e.target.value })}
                                    className="w-full bg-black/60 text-white text-sm font-mono px-5 py-4 rounded-2xl border border-white/5 focus:outline-none focus:border-purple-500/50 focus:bg-black/80 transition-all" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">Terminal Chat IDs (Global)</label>
                            <input type="text" placeholder="-100xxxxxxxxxx, 123456789" value={tgConfig.chatId}
                                onChange={e => handleSaveConfig({ ...tgConfig, chatId: e.target.value })}
                                className="w-full bg-black/60 text-white text-sm font-mono px-5 py-4 rounded-2xl border border-white/5 focus:outline-none focus:border-purple-500/50 focus:bg-black/80 transition-all" />
                        </div>
                    </div>

                    <div className="flex flex-col md:flex-row items-center justify-between gap-6 pt-8 border-t border-white/5">
                        <div className="flex items-center gap-4">
                            <button onClick={playAlarm} className="text-[10px] font-black text-purple-400 hover:text-white transition-colors uppercase tracking-[0.1em]">Test Acoustic Alarm</button>
                        </div>
                        <button onClick={handleTestAlert} disabled={!tgConfig.botToken || !tgConfig.chatId || testStatus === 'sending'}
                            className="px-8 py-4 bg-white text-black rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all disabled:opacity-20 flex items-center gap-3">
                            {testStatus === 'sending' ? <RefreshCcw className="w-4 h-4 animate-spin" /> :
                                testStatus === 'ok' ? <CheckCircle className="w-4 h-4" /> :
                                    testStatus === 'fail' ? <XCircle className="w-4 h-4" /> :
                                        <Send className="w-4 h-4" />}
                            {testStatus === 'ok' ? 'Handshake Success' : testStatus === 'fail' ? 'Handshake Failed' : 'Send Test Transmission'}
                        </button>
                    </div>
                </div>
            )}

            {/* Signal Grid - Premium Cards */}
            <div className="flex-1 overflow-y-auto p-8 lg:p-12 custom-scrollbar">
                <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-8">
                    {displaySignals.map((sig: BuySignal) => (
                        <SignalCard
                            key={sig.ticker.id}
                            sig={sig}
                            currentTime={currentTime}
                            onTickerClick={onTickerClick}
                            onAddToWatchlist={onAddToWatchlist}
                        />
                    ))}
                </div>

                {displaySignals.length === 0 && (
                    <div className="flex flex-col items-center justify-center p-32 text-white/10 italic animate-pulse-slow">
                        <Zap className="w-16 h-16 mb-6 opacity-20" />
                        <p className="text-sm font-black uppercase tracking-[0.3em]">Scanning Global Exchanges for Golden-Tier Probabilities...</p>
                    </div>
                )}
            </div>

            {/* ─── Premium Signal Performance Tracker Slide-out/Footer ─── */}
            {trackedGoldens.length > 0 && (() => {
                const winners = trackedGoldens.filter(t => ((t.lastPrice - t.entryPrice) / t.entryPrice) * 100 >= 0)
                    .sort((a, b) => ((b.lastPrice - b.entryPrice) / b.entryPrice) - ((a.lastPrice - a.entryPrice) / a.entryPrice));
                const losers = trackedGoldens.filter(t => ((t.lastPrice - t.entryPrice) / t.entryPrice) * 100 < 0)
                    .sort((a, b) => ((a.lastPrice - a.entryPrice) / a.entryPrice) - ((b.lastPrice - b.entryPrice) / b.entryPrice));
                const avgPnl = trackedGoldens.reduce((s, t) => s + ((t.lastPrice - t.entryPrice) / t.entryPrice) * 100, 0) / trackedGoldens.length;
                const winRate = (winners.length / trackedGoldens.length) * 100;

                return (
                    <div className="mt-8 border-t border-white/5 pt-12">
                        {/* Tracker Global Stats */}
                        <div className="mb-10 flex flex-col lg:flex-row lg:items-center justify-between gap-8 px-2">
                            <div className="flex items-center gap-5">
                                <div className="w-16 h-16 rounded-[1.5rem] bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shadow-2xl">
                                    <Target className="w-8 h-8 text-amber-500" />
                                </div>
                                <div>
                                    <h3 className="text-2xl font-black text-white uppercase italic tracking-tighter">Live Benchmark</h3>
                                    <div className="flex items-center gap-3 mt-1">
                                        <p className="text-[10px] text-white/30 font-black uppercase tracking-[0.2em]">{trackedGoldens.length} Audited Transmissions (24H window)</p>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-4 bg-black/40 p-2 rounded-3xl border border-white/[0.03]">
                                <div className="px-8 py-3 bg-white/5 rounded-2xl border border-white/5 group hover:border-emerald-500/30 transition-all">
                                    <div className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-1">Portfolio yield</div>
                                    <span className={`text-xl font-black italic tracking-tighter ${avgPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{avgPnl >= 0 ? '+' : ''}{avgPnl.toFixed(2)}%</span>
                                </div>
                                <div className="px-8 py-3 bg-white/5 rounded-2xl border border-white/5 group hover:border-amber-500/30 transition-all">
                                    <div className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-1">Signal Fidelity</div>
                                    <span className={`text-xl font-black italic tracking-tighter ${winRate >= 50 ? 'text-amber-500' : 'text-rose-400'}`}>{winRate.toFixed(0)}%</span>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-12">
                            {/* WINNERS Column */}
                            <div>
                                <div className="flex items-center justify-between mb-6 px-4">
                                    <div className="flex items-center gap-3">
                                        <TrendingUp className="w-5 h-5 text-emerald-500" />
                                        <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em]">Alpha Stream (Gainers)</span>
                                    </div>
                                    <span className="text-[10px] font-black text-emerald-500 bg-emerald-500/10 px-3 py-1 rounded-full">{winners.length} Pairs</span>
                                </div>
                                <div className="space-y-4 max-h-[600px] overflow-y-auto custom-scrollbar px-2">
                                    {winners.length > 0 ? winners.filter(t => !t.exitTime).map(t => <PerformanceRow key={t.symbol} t={t} currentTime={currentTime} />) : (
                                        <div className="h-32 rounded-3xl border border-dashed border-white/5 flex items-center justify-center text-[10px] font-black text-white/10 uppercase tracking-widest">Awaiting Alpha Confirmations...</div>
                                    )}
                                </div>
                            </div>

                            {/* LOSERS Column */}
                            <div>
                                <div className="flex items-center justify-between mb-6 px-4">
                                    <div className="flex items-center gap-3">
                                        <TrendingDown className="w-5 h-5 text-rose-500" />
                                        <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em]">Risk Stream (Drawdown)</span>
                                    </div>
                                    <span className="text-[10px] font-black text-rose-500 bg-rose-500/10 px-3 py-1 rounded-full">{losers.length} Pairs</span>
                                </div>
                                <div className="space-y-4 max-h-[600px] overflow-y-auto custom-scrollbar px-2">
                                    {losers.length > 0 ? losers.filter(t => !t.exitTime).map(t => <PerformanceRow key={t.symbol} t={t} currentTime={currentTime} />) : (
                                        <div className="h-32 rounded-3xl border border-dashed border-white/5 flex items-center justify-center text-[10px] font-black text-white/10 uppercase tracking-widest">No Negative Variance Detected 🎯</div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* ─── REALIZED GAINS SECTION ─── */}
                        <div className="mt-16 bg-black/40 rounded-[2.5rem] p-10 border border-white/[0.03] relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/5 blur-[100px] rounded-full"></div>
                            <div className="flex items-center justify-between mb-10 relative z-10">
                                <div className="flex items-center gap-5">
                                    <div className="w-14 h-14 rounded-2xl bg-white text-black flex items-center justify-center shadow-xl">
                                        <ShieldCheck className="w-7 h-7" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-black text-white uppercase italic tracking-tighter">Realized Neural Gains</h3>
                                        <p className="text-[9px] text-white/20 font-black uppercase tracking-[0.3em]">Historical Performance Vault (24H window)</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    {(() => {
                                        const realizedTrades = trackedGoldens.filter(t => t.exitTime);
                                        const netRealized = realizedTrades.reduce((s, t) => s + (t.realizedPnl || 0), 0);
                                        return (
                                            <div className="px-6 py-3 bg-white/5 rounded-2xl border border-white/10">
                                                <span className="block text-[8px] font-black text-white/30 uppercase tracking-widest mb-1 text-right">Net Realized</span>
                                                <span className={`text-lg font-black italic tracking-tighter ${netRealized >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                    {netRealized >= 0 ? '+' : ''}{netRealized.toFixed(2)}%
                                                </span>
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-6 relative z-10">
                                {trackedGoldens.filter(t => t.exitTime).length > 0 ? (
                                    trackedGoldens
                                        .filter(t => t.exitTime)
                                        .sort((a, b) => (b.exitTime || 0) - (a.exitTime || 0))
                                        .map(t => <PerformanceRow key={t.symbol} t={t} currentTime={currentTime} />)
                                ) : (
                                    <div className="col-span-full h-32 flex flex-col items-center justify-center border border-dashed border-white/5 rounded-3xl opacity-20 group">
                                        <p className="text-[10px] font-black uppercase tracking-[0.4em] group-hover:tracking-[0.6em] transition-all">Vault Empty - No Neural Trades Finalized Yet</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Corporate Legal Footer */}
            <footer className="mt-20 py-12 border-t border-white/[0.03] flex flex-col items-center gap-5">
                <div className="flex items-center gap-4 opacity-20 hover:opacity-100 transition-opacity">
                    <ShieldCheck className="w-5 h-5 text-purple-500" />
                    <div className="w-px h-6 bg-white/20"></div>
                    <p className="text-[9px] font-black text-white uppercase tracking-[0.5em]">Quantitative Analysis v1.0.4-Stable</p>
                </div>
                <p className="text-[8px] text-white/10 font-bold max-w-2xl text-center leading-loose uppercase tracking-[0.1em]">
                    This terminal is designed for advanced traders. VWAP indicators and Neural signals are calculated based on historical structural data. Market risk is high. Continuous synchronization with global liquidity is not guaranteed.
                </p>
            </footer>
        </div >
    );
};
