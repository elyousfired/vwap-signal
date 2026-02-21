
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { CexTicker, VwapData } from '../types';
import { fetchWeeklyVwapData, formatPrice } from '../services/cexService';
import { Brain, Star, TrendingUp, TrendingDown, Info, ArrowRight, Zap, Trophy, ShieldCheck, Bell, Settings, Send, CheckCircle, XCircle, Volume2, VolumeX, Timer, Filter, BarChart3, Target } from 'lucide-react';
import { sendGoldenSignalAlert, wasAlertedToday, loadTelegramConfig, saveTelegramConfig, sendTestAlert, TelegramConfig } from '../services/telegramService';

// ─── Golden Signal Tracker Types ───────────────
interface TrackedGolden {
    symbol: string;
    entryPrice: number;
    signalTime: number;
    maxPrice: number;
    maxGainPct: number;
    lastPrice: number;
    stillActive: boolean;
    history?: number[]; // Added for sparklines
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

export const DecisionBuyAi: React.FC<DecisionBuyAiProps> = ({
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
    const [alertCount, setAlertCount] = useState(0);
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
        return signals.filter(s => s.type === 'GOLDEN');
    }, [signals]);

    // ─── Telegram Alert Trigger ───────────────────
    useEffect(() => {
        if (!tgConfig.enabled) return;

        const allActiveSymbols = new Set(signals.map(s => s.ticker.symbol));

        let sent = 0;
        signals.forEach(sig => {
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
        cleanupList.forEach(ref => {
            ref.current.forEach(symbol => {
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
            goldenSignals.forEach(sig => {
                const existing = updated.find(t => t.symbol === sig.ticker.symbol);
                if (!existing) {
                    updated.push({
                        symbol: sig.ticker.symbol,
                        entryPrice: sig.ticker.priceUsd,
                        signalTime: sig.activeSince || Date.now(),
                        maxPrice: sig.ticker.priceUsd,
                        maxGainPct: 0,
                        lastPrice: sig.ticker.priceUsd,
                        stillActive: true,
                        history: [sig.ticker.priceUsd]
                    });
                }
            });

            // 2. Update all tracked entries with current prices
            updated = updated.map(t => {
                const ticker = tickers.find(tk => tk.symbol === t.symbol);
                if (!ticker) return t;

                const currentPrice = ticker.priceUsd;
                const pnl = ((currentPrice - t.entryPrice) / t.entryPrice) * 100;
                const newMax = Math.max(t.maxPrice, currentPrice);
                const newMaxGain = Math.max(t.maxGainPct, pnl);

                // Update history every 10 minutes (limit to 144 points for 24h)
                const history = t.history || [t.entryPrice];
                const lastPoint = history[history.length - 1];
                const shouldAddPoint = history.length < 144 && (Date.now() - (t.signalTime + (history.length - 1) * 10 * 60 * 1000) > 10 * 60 * 1000);

                return {
                    ...t,
                    lastPrice: currentPrice,
                    maxPrice: newMax,
                    maxGainPct: newMaxGain,
                    stillActive: goldenSymbols.has(t.symbol),
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
            <div className="flex flex-col items-center justify-center p-20 text-gray-500 gap-4">
                <Brain className="w-12 h-12 text-purple-500 animate-pulse" />
                <p className="text-sm font-black tracking-widest uppercase">AI Engine Analyzing Buy Signals...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-[#0d0f14] rounded-2xl border border-purple-500/20 shadow-[0_0_50px_rgba(168,85,247,0.05)] overflow-hidden">
            {/* AI Header */}
            <div className="p-6 border-b border-purple-500/20 bg-gradient-to-r from-purple-900/10 to-transparent flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-purple-500/20 rounded-2xl border border-purple-500/30">
                        <Brain className="w-8 h-8 text-purple-400" />
                    </div>
                    <div>
                        <h2 className="text-xl font-black tracking-tighter text-white uppercase italic">Decision Buy AI</h2>
                        <p className="text-xs text-purple-400/60 font-medium font-mono lowercase">Predictive breakout & support engine v1.0</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className="flex items-center bg-black/40 rounded-xl p-1 border border-purple-500/20 mr-2">
                        <button
                            onClick={() => setSortBy('score')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${sortBy === 'score' ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'
                                }`}
                        >
                            <Trophy className="w-3 h-3" />
                            SCORE
                        </button>
                        <button
                            onClick={() => setSortBy('time')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${sortBy === 'time' ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'
                                }`}
                        >
                            <Timer className="w-3 h-3" />
                            TIME
                        </button>
                    </div>

                    <button onClick={() => setShowSettings(!showSettings)}
                        className={`p-3 rounded-xl border transition-all ${showSettings ? 'bg-purple-600 border-purple-400 text-white' : 'bg-gray-800/50 border-gray-700 text-gray-400 hover:text-white'}`}>
                        <Settings className={`w-5 h-5 ${showSettings ? 'animate-spin-slow' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Telegram Settings Panel */}
            {showSettings && (
                <div className="p-5 bg-[#0a0c10] border-b border-gray-800">
                    <div className="flex items-center gap-2 mb-4">
                        <Settings className="w-4 h-4 text-purple-400" />
                        <h3 className="text-xs font-black text-white uppercase tracking-widest">Telegram Alerts</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-1">Bot Token</label>
                            <input type="password" placeholder="123456:ABC-DEF1234ghIkl..." value={tgConfig.botToken}
                                onChange={e => handleSaveConfig({ ...tgConfig, botToken: e.target.value })}
                                className="w-full bg-black/60 text-white text-sm font-mono px-3 py-2 rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500" />
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-1">Chat IDs (comma-separated)</label>
                            <input type="text" placeholder="123456789, 987654321" value={tgConfig.chatId}
                                onChange={e => handleSaveConfig({ ...tgConfig, chatId: e.target.value })}
                                className="w-full bg-black/60 text-white text-sm font-mono px-3 py-2 rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500" />
                        </div>
                    </div>
                    <div className="flex items-center justify-between">
                        <label className="flex items-center gap-3 cursor-pointer">
                            <div className={`w-10 h-5 rounded-full relative transition-all ${tgConfig.enabled ? 'bg-emerald-500' : 'bg-gray-700'}`}
                                onClick={() => handleSaveConfig({ ...tgConfig, enabled: !tgConfig.enabled })}>
                                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${tgConfig.enabled ? 'left-5.5' : 'left-0.5'}`}></div>
                            </div>
                            <span className="text-xs font-bold text-gray-400">{tgConfig.enabled ? 'Alerts ON' : 'Alerts OFF'}</span>
                        </label>
                        <button onClick={handleTestAlert} disabled={!tgConfig.botToken || !tgConfig.chatId || testStatus === 'sending'}
                            className="flex items-center gap-2 px-4 py-2 bg-purple-600/20 text-purple-400 border border-purple-500/30 rounded-xl text-[10px] font-black uppercase hover:bg-purple-600 hover:text-white transition-all disabled:opacity-30">
                            {testStatus === 'sending' ? <Send className="w-3 h-3 animate-pulse" /> :
                                testStatus === 'ok' ? <CheckCircle className="w-3 h-3 text-emerald-400" /> :
                                    testStatus === 'fail' ? <XCircle className="w-3 h-3 text-rose-400" /> :
                                        <Send className="w-3 h-3" />}
                            {testStatus === 'ok' ? 'Sent!' : testStatus === 'fail' ? 'Failed' : 'Test Alert'}
                        </button>
                    </div>
                    <div className="flex items-center justify-between border-t border-gray-800 pt-4 mt-4">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setAudioEnabled(!audioEnabled)}
                                className={`p-2 rounded-lg border transition-all ${audioEnabled ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' : 'bg-gray-800 border-gray-700 text-gray-500'}`}
                            >
                                {audioEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                            </button>
                            <div>
                                <h4 className="text-[10px] font-black text-white uppercase">Audio Alarm</h4>
                                <p className="text-[9px] text-gray-500 font-bold uppercase">Sound on Golden Signal</p>
                            </div>
                        </div>
                        <button
                            onClick={playAlarm}
                            className="px-4 py-2 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-xl text-[10px] font-black uppercase hover:bg-blue-600 hover:text-white transition-all"
                        >
                            Test Sound
                        </button>
                    </div>
                    <p className="text-[9px] text-gray-600 mt-3 font-bold">Create a bot via @BotFather on Telegram. Each user must /start the bot, then get their Chat ID via @userinfobot. Separate multiple IDs with commas.</p>
                </div>
            )}

            {/* Signal List */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {displaySignals.map((sig) => (
                        <button
                            key={sig.ticker.id}
                            onClick={() => onTickerClick(sig.ticker)}
                            className="group relative flex flex-col p-5 bg-[#12141c] rounded-2xl border border-gray-800 hover:border-purple-500/50 transition-all duration-300 hover:shadow-[0_0_30px_rgba(168,85,247,0.1)] active:scale-[0.99]"
                        >
                            {/* Score Badge */}
                            <div className="absolute top-4 right-4 flex flex-col items-end">
                                <div className="text-[10px] font-black text-gray-500 uppercase mb-1">Buy Score</div>
                                <div className="flex items-center gap-2">
                                    <Trophy className={`w-4 h-4 ${sig.score > 90 ? 'text-yellow-500' : 'text-purple-400'}`} />
                                    <span className="text-2xl font-black text-white italic">{sig.score.toFixed(0)}</span>
                                </div>
                                {sig.type === 'GOLDEN' && sig.activeSince && (
                                    <span className="text-[9px] font-black text-amber-500/70 mt-1 uppercase tracking-tighter bg-amber-500/5 px-2 py-0.5 rounded border border-amber-500/10">
                                        ⏱️ {Math.floor((currentTime - sig.activeSince) / 1000 / 60)}m {Math.floor((currentTime - sig.activeSince) / 1000) % 60}s
                                    </span>
                                )}
                            </div>

                            <div className="flex items-center gap-3 mb-4">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg ${sig.type === 'GOLDEN' ? 'bg-yellow-500 text-black' :
                                    sig.type === 'EXIT' ? 'bg-rose-600 text-white' :
                                        sig.type === 'MOMENTUM' ? 'bg-purple-600 text-white' :
                                            'bg-blue-600 text-white'
                                    }`}>
                                    {sig.ticker.symbol[0]}
                                </div>
                                <div>
                                    <h3 className="text-lg font-black text-white group-hover:text-purple-400 transition-colors uppercase tracking-tighter">
                                        {sig.ticker.symbol} / USDT
                                    </h3>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${sig.type === 'GOLDEN' ? 'bg-yellow-500/20 text-yellow-500' :
                                            sig.type === 'EXIT' ? 'bg-rose-500/20 text-rose-500' :
                                                sig.type === 'MOMENTUM' ? 'bg-purple-500/20 text-purple-400' :
                                                    'bg-blue-500/20 text-blue-400'
                                            }`}>
                                            {sig.type} SIGNAL
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-black/40 rounded-xl p-4 border border-white/5 mb-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <ShieldCheck className="w-4 h-4 text-purple-400" />
                                    <span className="text-xs font-black text-gray-300 uppercase tracking-widest">AI Verdict</span>
                                </div>
                                <p className="text-sm text-gray-400 leading-relaxed font-medium">
                                    {sig.reason}
                                </p>
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black text-gray-600 uppercase mb-1">Price</span>
                                    <span className="text-sm font-mono font-bold text-white">${formatPrice(sig.ticker.priceUsd)}</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black text-gray-600 uppercase mb-1">Target (Max)</span>
                                    <span className="text-sm font-mono font-bold text-green-400">${formatPrice(sig.vwap.max)}</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black text-gray-600 uppercase mb-1">Stop (Mid)</span>
                                    <span className="text-sm font-mono font-bold text-rose-400">${formatPrice(sig.vwap.mid)}</span>
                                </div>
                            </div>

                            <div className="mt-6 flex items-center justify-between">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onAddToWatchlist(sig.ticker);
                                    }}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-blue-600/10 text-blue-400 border border-blue-600/20 rounded-xl text-[10px] font-black hover:bg-blue-600 hover:text-white transition-all"
                                >
                                    <Star className="w-3 h-3" />
                                    ADD TO WATCHLIST
                                </button>
                                <div className="flex items-center gap-1 text-purple-400 font-black text-xs group-hover:gap-2 transition-all uppercase">
                                    Investigate <ArrowRight className="w-4 h-4" />
                                </div>
                            </div>
                        </button>
                    ))}
                </div>

                {displaySignals.length === 0 && (
                    <div className="flex flex-col items-center justify-center p-20 text-gray-500 italic">
                        <Zap className="w-12 h-12 opacity-10 mb-4" />
                        <p>Scanning markets for low-risk Golden Entry opportunities...</p>
                    </div>
                )}
            </div>

            {/* ─── Golden Signal Performance Tracker ─── */}
            {trackedGoldens.length > 0 && (() => {
                const winners = trackedGoldens.filter(t => ((t.lastPrice - t.entryPrice) / t.entryPrice) * 100 >= 0)
                    .sort((a, b) => ((b.lastPrice - b.entryPrice) / b.entryPrice) - ((a.lastPrice - a.entryPrice) / a.entryPrice));
                const losers = trackedGoldens.filter(t => ((t.lastPrice - t.entryPrice) / t.entryPrice) * 100 < 0)
                    .sort((a, b) => ((a.lastPrice - a.entryPrice) / a.entryPrice) - ((b.lastPrice - b.entryPrice) / b.entryPrice));
                const avgPnl = trackedGoldens.reduce((s, t) => s + ((t.lastPrice - t.entryPrice) / t.entryPrice) * 100, 0) / trackedGoldens.length;
                const winRate = (winners.length / trackedGoldens.length) * 100;

                const renderRow = (t: TrackedGolden) => {
                    const pnl = ((t.lastPrice - t.entryPrice) / t.entryPrice) * 100;
                    const elapsed = currentTime - t.signalTime;
                    const hoursAgo = Math.floor(elapsed / 3600000);
                    const minsAgo = Math.floor((elapsed % 3600000) / 60000);
                    const isPositive = pnl >= 0;

                    // Sparkline logic (normalized price path)
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
                        <div key={t.symbol} className={`flex items-center gap-4 p-3 rounded-xl border transition-all ${t.stillActive
                            ? isPositive ? 'bg-emerald-500/5 border-emerald-500/15 hover:border-emerald-500/30' : 'bg-rose-500/5 border-rose-500/15 hover:border-rose-500/30'
                            : 'bg-gray-800/20 border-gray-800/40 opacity-70'
                            }`}>
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-black text-sm shrink-0 ${t.stillActive ? 'bg-yellow-500 text-black' : 'bg-gray-700 text-gray-400'
                                }`}>
                                {t.symbol[0]}
                            </div>

                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-black text-white uppercase tracking-tight">{t.symbol}</span>
                                        {t.stillActive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                                    </div>
                                    <span className="text-[8px] text-gray-600 font-bold uppercase">{hoursAgo}h {minsAgo}m ago</span>
                                </div>

                                <div className="flex items-center gap-4 mt-1.5">
                                    <div className="flex flex-col">
                                        <span className="text-[8px] text-gray-600 font-black uppercase">Entry</span>
                                        <span className="text-[10px] text-gray-400 font-mono">${formatPrice(t.entryPrice)}</span>
                                    </div>
                                    <div className="flex-1 h-[30px] relative px-2">
                                        <svg width="100%" height="30" viewBox="0 0 100 30" preserveAspectRatio="none" className="overflow-visible">
                                            <polyline
                                                points={points}
                                                fill="none"
                                                stroke={isPositive ? '#10b981' : '#f43f5e'}
                                                strokeWidth="1.5"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                className="opacity-40"
                                            />
                                            {/* Take Profit Target Line (+5%) */}
                                            <line x1="0" y1="0" x2="100" y2="0" stroke="#10b981" strokeWidth="0.5" strokeDasharray="2,2" className="opacity-10" />
                                            {/* Stop Loss Target Line (-2%) */}
                                            <line x1="0" y1="28" x2="100" y2="28" stroke="#f43f5e" strokeWidth="0.5" strokeDasharray="2,2" className="opacity-10" />
                                        </svg>
                                    </div>
                                    <div className="flex flex-col text-right">
                                        <span className="text-[8px] text-gray-600 font-black uppercase">Now</span>
                                        <span className={`text-[10px] font-mono ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>${formatPrice(t.lastPrice)}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-5 shrink-0 pl-4 border-l border-gray-800/50">
                                <div className="text-right">
                                    <div className="text-[8px] font-black text-gray-600 uppercase">P&L</div>
                                    <div className={`text-base font-black ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {isPositive ? '+' : ''}{pnl.toFixed(2)}%
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-[8px] font-black text-gray-600 uppercase">Max</div>
                                    <div className="text-sm font-black text-emerald-400">+{t.maxGainPct.toFixed(2)}%</div>
                                </div>
                            </div>
                        </div>
                    );
                };

                return (
                    <div className="border-t border-amber-500/20">
                        {/* Header */}
                        <div className="p-5 pb-3 flex items-center justify-between bg-gradient-to-r from-amber-900/10 to-transparent">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-amber-500/10 rounded-xl border border-amber-500/20">
                                    <Target className="w-5 h-5 text-amber-400" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-black text-white uppercase tracking-tighter">Golden Signal Tracker — 24H</h3>
                                    <p className="text-[9px] text-amber-400/50 font-bold uppercase tracking-widest">{trackedGoldens.length} Tokens Tracked • {winners.length} Winners • {losers.length} Losers</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="text-center px-3 py-1.5 bg-black/40 rounded-xl border border-gray-800">
                                    <div className="text-[8px] font-black text-gray-600 uppercase">Avg P&L</div>
                                    <span className={`text-sm font-black ${avgPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{avgPnl >= 0 ? '+' : ''}{avgPnl.toFixed(2)}%</span>
                                </div>
                                <div className="text-center px-3 py-1.5 bg-black/40 rounded-xl border border-gray-800">
                                    <div className="text-[8px] font-black text-gray-600 uppercase">Win Rate</div>
                                    <span className={`text-sm font-black ${winRate >= 50 ? 'text-emerald-400' : 'text-rose-400'}`}>{winRate.toFixed(0)}%</span>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-0">
                            {/* WINNERS Column */}
                            <div className="border-r border-gray-800/50">
                                <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500/5 border-b border-emerald-500/10">
                                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                                    <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Winners ({winners.length})</span>
                                    {winners.length > 0 && (
                                        <span className="ml-auto text-[10px] font-black text-emerald-400">
                                            +{(winners.reduce((s, t) => s + ((t.lastPrice - t.entryPrice) / t.entryPrice) * 100, 0) / winners.length).toFixed(2)}% avg
                                        </span>
                                    )}
                                </div>
                                <div className="p-3 space-y-2 max-h-[500px] overflow-y-auto custom-scrollbar">
                                    {winners.length > 0 ? winners.map(renderRow) : (
                                        <div className="flex items-center justify-center p-8 text-gray-600 italic text-xs">No winners yet</div>
                                    )}
                                </div>
                            </div>

                            {/* LOSERS Column */}
                            <div>
                                <div className="flex items-center gap-2 px-4 py-2.5 bg-rose-500/5 border-b border-rose-500/10">
                                    <TrendingDown className="w-4 h-4 text-rose-400" />
                                    <span className="text-[10px] font-black text-rose-400 uppercase tracking-widest">Losers ({losers.length})</span>
                                    {losers.length > 0 && (
                                        <span className="ml-auto text-[10px] font-black text-rose-400">
                                            {(losers.reduce((s, t) => s + ((t.lastPrice - t.entryPrice) / t.entryPrice) * 100, 0) / losers.length).toFixed(2)}% avg
                                        </span>
                                    )}
                                </div>
                                <div className="p-3 space-y-2 max-h-[500px] overflow-y-auto custom-scrollbar">
                                    {losers.length > 0 ? losers.map(renderRow) : (
                                        <div className="flex items-center justify-center p-8 text-gray-600 italic text-xs">No losers — all winning! 🎯</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Footer Notice */}
            <div className="p-4 bg-purple-900/5 border-t border-purple-500/10 flex items-center gap-3">
                <Info className="w-4 h-4 text-purple-400" />
                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                    AI Signals are for educational purposes. Always verify Liquidity Flow & CVD before entering a trade.
                </span>
            </div>
        </div>
    );
};
