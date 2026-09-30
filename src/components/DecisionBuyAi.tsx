import React, { useState, useEffect, useMemo } from 'react';
import type { FC } from 'react';
import type { CexTicker, VwapData } from '../types';
import { formatPrice, fetchDailyVwapSequence } from '../services/cexService';
import { Brain, Star, ArrowRight, Zap, Trophy, ShieldCheck, Timer, X } from 'lucide-react';
import { TokenChart } from './TokenChart';

export interface BuySignal {
    ticker: CexTicker;
    vwap: VwapData;
    score: number;
    reason: string;
    type: 'GOLDEN' | 'MOMENTUM';
}

interface DecisionBuyAiProps {
    tickers: CexTicker[];
    vwapStore: Record<string, VwapData>;
    firstSeenTimes: Record<string, number>;
    isLoading: boolean;
    onAddToWatchlist: (ticker: CexTicker) => void;
}

// ─── Memoized Signal Card ─────────────────
interface SignalCardProps {
    sig: BuySignal & { activeSince: number };
    currentTime: number;
    onCardClick: (sig: BuySignal) => void;
    onAddToWatchlist: (ticker: CexTicker) => void;
}

const SignalCard = React.memo<SignalCardProps>(({ sig, currentTime, onCardClick, onAddToWatchlist }) => (
    <div
        onClick={() => {
            console.log("SignalCard Clicked:", sig.ticker.symbol);
            onCardClick(sig);
        }}
        className="group glass-card rounded-[2rem] p-7 flex flex-col text-left relative overflow-hidden cursor-pointer active:scale-[0.98] transition-all"
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
                        <span className="text-[10px] text-white/20 font-bold tracking-widest italic group-hover:text-purple-400/40">15m Confirm</span>
                    </h3>
                    <div className="mt-1 flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${sig.type === 'GOLDEN' ? 'bg-amber-500' : 'bg-purple-500'}`}></div>
                        <span className={`text-[9px] font-black uppercase tracking-[0.1em] ${sig.type === 'GOLDEN' ? 'text-amber-500' : 'text-purple-400'}`}>
                            {sig.type} SIGNAL (Confirmed Close)
                        </span>
                    </div>
                </div>
            </div>
            <div className="flex flex-col items-end">
                <div className="flex items-center gap-2.5 px-3 py-1.5 bg-white/5 border border-white/10 rounded-xl group-hover:border-purple-500/30 transition-colors">
                    <Trophy className={`w-4 h-4 ${sig.score > 90 ? 'text-amber-500' : 'text-purple-400'}`} />
                    <span className="text-2xl font-black text-white italic tracking-tighter">{sig.score.toFixed(0)}</span>
                </div>
                <div className={`mt-2 px-2 py-0.5 rounded-lg border text-[8px] font-black uppercase tracking-widest ${sig.vwap.volumeRelative > 1.5 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-white/5 border-white/10 text-white/40'}`}>
                    RVOL: {sig.vwap.volumeRelative.toFixed(1)}x
                </div>
                {sig.activeSince && (
                    <span className="text-[9px] font-bold text-white/20 mt-1.5 uppercase tracking-tighter">
                        ⏱️ {Math.floor((currentTime - sig.activeSince) / 1000 / 60)}m {Math.floor((currentTime - sig.activeSince) / 1000) % 60}s
                    </span>
                )}
            </div>
        </div>

        {sig.score >= 98 && (
            <div className="mx-7 mb-4 px-4 py-2 bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 rounded-xl flex items-center justify-between animate-pulse">
                <div className="flex items-center gap-2">
                    <Zap className="w-3 h-3 text-amber-500" />
                    <span className="text-[9px] font-black text-amber-500 uppercase tracking-widest">Neural Alpha Active</span>
                </div>
                <div className="text-[8px] font-bold text-amber-500/60 uppercase">High Conviction</div>
            </div>
        )}
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
    </div>
));

export const DecisionBuyAi: FC<DecisionBuyAiProps> = ({
    tickers,
    vwapStore,
    firstSeenTimes,
    isLoading,
    onAddToWatchlist
}) => {
    const [sortBy, setSortBy] = useState<'score' | 'time'>('score');
    const [currentTime, setCurrentTime] = useState(Date.now());
    const [selectedChart, setSelectedChart] = useState<{ ticker: CexTicker, vwap: VwapData } | null>(null);
    const [chartData, setChartData] = useState<{ time: number, vwap: number }[]>([]);
    const [isChartLoading, setIsChartLoading] = useState(false);

    // Fetch chart data when a ticker is selected
    useEffect(() => {
        if (!selectedChart) {
            setChartData([]);
            return;
        }

        const loadChart = async () => {
            setIsChartLoading(true);
            try {
                const data = await fetchDailyVwapSequence(selectedChart.ticker.symbol);
                setChartData(data);
            } catch (e) {
                console.error("Failed to load chart data:", e);
            } finally {
                setIsChartLoading(false);
            }
        };

        loadChart();
    }, [selectedChart]);

    // Live timer update
    useEffect(() => {
        const interval = setInterval(() => setCurrentTime(Date.now()), 1000);
        return () => clearInterval(interval);
    }, []);

    const signals = useMemo(() => {
        return tickers.map(t => {
            const vwap = vwapStore[t.id];
            if (!vwap) return null;

            const isVwapPositive = vwap.normalizedSlope > 0.05;
            const lastClose = vwap.last15mClose || 0;
            const isConfirmedNow = lastClose > vwap.max && lastClose > vwap.mid;

            const prevClose = vwap.prev15mClose || 0;
            const wasConfirmedPrev = prevClose > vwap.max && prevClose > vwap.mid;

            const isFreshCrossover = isConfirmedNow && !wasConfirmedPrev;

            if (isFreshCrossover && isVwapPositive) {
                const rvol = vwap.volumeRelative || 1.0;
                const isNeuralAlpha = vwap.normalizedSlope > 0.10 && rvol > 1.2;

                let score = 95 + Math.min(3, vwap.normalizedSlope * 10);
                if (rvol > 1.5) score += 2;
                if (isNeuralAlpha) score += 2;

                return {
                    ticker: t,
                    vwap,
                    score: Math.min(100, score),
                    reason: isNeuralAlpha
                        ? `Neural Alpha: Elite fresh 15m confirmed breakout.`
                        : `Fresh 15m Crossover: Confirmed closed at $${formatPrice(lastClose)}.`,
                    activeSince: (firstSeenTimes[t.id] || Date.now()),
                    type: 'GOLDEN' as const
                };
            }

        }).filter(Boolean) as (BuySignal & { activeSince: number })[];
    }, [tickers, vwapStore, firstSeenTimes]);

    const displaySignals = useMemo(() => {
        let sorted = [...(signals as (BuySignal & { activeSince: number })[])];
        if (sortBy === 'score') {
            sorted = sorted.sort((a, b) => b.score - a.score);
        } else {
            sorted = sorted.sort((a, b) => b.activeSince - a.activeSince);
        }
        return sorted;
    }, [signals, sortBy]);

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
            </div>

            {/* Signal Grid - Premium Cards */}
            <div className="flex-1 overflow-y-auto p-8 lg:p-12 custom-scrollbar">
                <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-8">
                    {displaySignals.map((sig: BuySignal & { activeSince: number }) => (
                        <SignalCard
                            key={sig.ticker.id}
                            sig={sig}
                            currentTime={currentTime}
                            onCardClick={(s) => {
                                console.log("Selecting chart for:", s.ticker.symbol);
                                setSelectedChart({ ticker: s.ticker, vwap: s.vwap });
                            }}
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

            {/* Chart Modal Overlay */}
            {selectedChart && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 lg:p-12">
                    <div
                        className="absolute inset-0 bg-black/90 backdrop-blur-2xl transition-opacity animate-in fade-in"
                        onClick={() => setSelectedChart(null)}
                    ></div>
                    <div className="relative w-full max-w-5xl glass-panel rounded-[3rem] border border-purple-500/20 overflow-hidden shadow-[0_0_100px_rgba(168,85,247,0.15)] animate-in zoom-in-95 duration-300">
                        <div className="absolute top-0 right-0 p-8 z-10">
                            <button
                                onClick={() => setSelectedChart(null)}
                                className="w-12 h-12 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-white transition-all group"
                            >
                                <X className="w-6 h-6 group-hover:rotate-90 transition-transform" />
                            </button>
                        </div>

                        <div className="p-12">
                            <div className="mb-12">
                                <div className="flex items-center gap-4 mb-4">
                                    <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse"></div>
                                    <span className="text-[10px] font-black text-purple-500 uppercase tracking-[0.4em]">Neural Market Visualization</span>
                                </div>
                                <h2 className="text-4xl font-black text-white italic tracking-tighter uppercase">
                                    {selectedChart.ticker.symbol} <span className="text-purple-500">Analytics</span>
                                </h2>
                            </div>

                            {isChartLoading ? (
                                <div className="h-[400px] flex flex-col items-center justify-center">
                                    <div className="w-20 h-20 border-4 border-purple-500/10 border-t-purple-500 rounded-full animate-spin mb-6"></div>
                                    <p className="text-sm font-black text-white/20 uppercase tracking-[0.3em]">Quantum Data Retrieval...</p>
                                </div>
                            ) : (
                                <TokenChart
                                    symbol={selectedChart.ticker.symbol}
                                    dailyVwap={chartData}
                                    wMax={selectedChart.vwap.max}
                                    wMin={selectedChart.vwap.min}
                                    currentPrice={selectedChart.ticker.priceUsd}
                                    className="border-none bg-transparent"
                                />
                            )}

                            <div className="mt-12 grid grid-cols-3 gap-8">
                                <div className="bg-white/[0.03] rounded-3xl p-6 border border-white/[0.05]">
                                    <span className="text-[10px] font-black text-white/20 uppercase tracking-widest block mb-2">24h Change</span>
                                    <span className={`text-2xl font-black italic tracking-tighter ${selectedChart.ticker.priceChangePercent24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {selectedChart.ticker.priceChangePercent24h >= 0 ? '+' : ''}{selectedChart.ticker.priceChangePercent24h.toFixed(2)}%
                                    </span>
                                </div>
                                <div className="bg-white/[0.03] rounded-3xl p-6 border border-white/[0.05]">
                                    <span className="text-[10px] font-black text-white/20 uppercase tracking-widest block mb-2">Rel Volume</span>
                                    <span className="text-2xl font-black text-white italic tracking-tighter">
                                        {selectedChart.vwap.volumeRelative.toFixed(1)}x
                                    </span>
                                </div>
                                <div className="bg-white/[0.03] rounded-3xl p-6 border border-white/[0.05]">
                                    <span className="text-[10px] font-black text-white/20 uppercase tracking-widest block mb-2">V-Trend</span>
                                    <span className={`text-2xl font-black italic tracking-tighter ${selectedChart.vwap.normalizedSlope > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {selectedChart.vwap.normalizedSlope > 0 ? 'BULLISH' : 'BEARISH'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="bg-purple-500/5 p-8 border-t border-white/5 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <ShieldCheck className="w-5 h-5 text-purple-400" />
                                <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Live Data Feed • Binance Secure API</span>
                            </div>
                            <button
                                onClick={() => window.open(`https://www.binance.com/en/trade/${selectedChart.ticker.symbol}_USDT`, '_blank')}
                                className="px-8 py-3 bg-white text-black rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all flex items-center gap-3"
                            >
                                Open Binance Exchange <ArrowRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div >
    );
};
