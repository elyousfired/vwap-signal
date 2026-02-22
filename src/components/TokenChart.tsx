import React, { useMemo } from 'react';
import { formatPrice } from '../services/cexService';

interface TokenChartProps {
    symbol: string;
    dailyVwap: { time: number, vwap: number }[];
    wMax: number;
    wMin: number;
    currentPrice: number;
    className?: string;
}

export const TokenChart: React.FC<TokenChartProps> = ({
    symbol,
    dailyVwap,
    wMax,
    wMin,
    currentPrice,
    className = ""
}) => {
    const points = useMemo(() => {
        if (dailyVwap.length < 2) return [];

        const prices = dailyVwap.map(d => d.vwap);
        const allPrices = [...prices, wMax, wMin, currentPrice];
        const minPrice = Math.min(...allPrices);
        const maxPrice = Math.max(...allPrices);
        const priceRange = (maxPrice - minPrice) || (currentPrice * 0.1);

        const padding = 20;
        const chartWidth = 800 - (padding * 2);
        const chartHeight = 300 - (padding * 2);

        return dailyVwap.map((d, i) => {
            const x = padding + (i / (dailyVwap.length - 1)) * chartWidth;
            const y = padding + chartHeight - ((d.vwap - minPrice) / priceRange) * chartHeight;
            return { x, y, vwap: d.vwap, time: d.time };
        });
    }, [dailyVwap, wMax, wMin, currentPrice]);

    const levels = useMemo(() => {
        if (dailyVwap.length === 0) return null;

        const prices = dailyVwap.map(d => d.vwap);
        const allPrices = [...prices, wMax, wMin, currentPrice];
        const minPrice = Math.min(...allPrices);
        const maxPrice = Math.max(...allPrices);
        const priceRange = (maxPrice - minPrice) || (currentPrice * 0.1);

        const padding = 20;
        const chartHeight = 300 - (padding * 2);

        const getLocalY = (p: number) => padding + chartHeight - ((p - minPrice) / priceRange) * chartHeight;

        return {
            wMaxY: getLocalY(wMax),
            wMinY: getLocalY(wMin),
            currentY: getLocalY(currentPrice),
            wMax,
            wMin,
            currentPrice
        };
    }, [dailyVwap, wMax, wMin, currentPrice]);

    const pathData = useMemo(() => {
        if (points.length < 2) return "";
        return points.reduce((acc, p, i) =>
            acc + (i === 0 ? `M ${p.x} ${p.y}` : ` L ${p.x} ${p.y}`), "");
    }, [points]);

    const hasData = dailyVwap.length >= 2;


    return (
        <div className={`relative bg-black/20 p-6 rounded-[2rem] border border-white/5 overflow-hidden group ${className}`}>
            {/* Background Glow */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-purple-600/5 blur-[100px] pointer-events-none"></div>

            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                        <span className="text-purple-400 font-black text-xs">{symbol[0]}</span>
                    </div>
                    <div>
                        <h3 className="text-sm font-black text-white uppercase tracking-widest">{symbol} / USDT</h3>
                        <p className="text-[9px] text-white/30 font-bold uppercase">Daily VWAP Curve & Weekly Levels</p>
                    </div>
                </div>
                <div className="text-right">
                    <span className="block text-[10px] font-black text-white/20 uppercase tracking-widest">Mark Price</span>
                    <span className="text-xl font-black text-white italic tracking-tighter">${formatPrice(currentPrice)}</span>
                </div>
            </div>

            <div className="relative h-[300px] w-full">
                <svg viewBox="0 0 800 300" className="w-full h-full overflow-visible">
                    <defs>
                        <linearGradient id="vwap-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor="#a855f7" stopOpacity="0.5" />
                            <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
                        </linearGradient>
                        <filter id="glow">
                            <feGaussianBlur stdDeviation="4" result="coloredBlur" />
                            <feMerge>
                                <feMergeNode in="coloredBlur" />
                                <feMergeNode in="SourceGraphic" />
                            </feMerge>
                        </filter>
                    </defs>

                    {/* horizontal grid lines (optional) */}
                    <line x1="20" y1="20" x2="780" y2="20" stroke="white" strokeWidth="1" strokeOpacity="0.03" />
                    <line x1="20" y1="280" x2="780" y2="280" stroke="white" strokeWidth="1" strokeOpacity="0.03" />

                    {levels && (
                        <>
                            {/* Weekly Max Level */}
                            <line
                                x1="20" y1={levels.wMaxY} x2="780" y2={levels.wMaxY}
                                stroke="#10b981" strokeWidth="1.5" strokeDasharray="6 4"
                                strokeOpacity="0.6"
                            />
                            <text x="785" y={levels.wMaxY + 4} className="fill-emerald-400 text-[10px] font-black italic">W-Max: ${formatPrice(levels.wMax)}</text>

                            {/* Weekly Min Level */}
                            <line
                                x1="20" y1={levels.wMinY} x2="780" y2={levels.wMinY}
                                stroke="#f43f5e" strokeWidth="1.5" strokeDasharray="6 4"
                                strokeOpacity="0.6"
                            />
                            <text x="785" y={levels.wMinY + 4} className="fill-rose-400 text-[10px] font-black italic">W-Min: ${formatPrice(levels.wMin)}</text>
                        </>
                    )}

                    {/* Area fill under VWAP */}
                    {hasData && (
                        <path
                            d={`${pathData} L ${points[points.length - 1].x} 280 L ${points[0].x} 280 Z`}
                            fill="url(#vwap-gradient)"
                            className="opacity-20"
                        />
                    )}

                    {/* Daily VWAP Path */}
                    {hasData ? (
                        <path
                            d={pathData}
                            fill="none"
                            stroke="#a855f7"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            filter="url(#glow)"
                            className="drop-shadow-[0_0_8px_rgba(168,85,247,0.5)]"
                        />
                    ) : (
                        <text x="400" y="150" textAnchor="middle" className="fill-white/10 text-[10px] font-black uppercase tracking-[0.5em]">
                            Awaiting Session Integration...
                        </text>
                    )}

                    {/* Current Price Dot */}
                    {points.length > 0 ? (
                        <circle
                            cx={points[points.length - 1].x}
                            cy={points[points.length - 1].y}
                            r="5"
                            fill="white"
                            className="drop-shadow-[0_0_8px_white]"
                        />
                    ) : (
                        <circle
                            cx="780"
                            cy={levels ? levels.currentY : 150}
                            r="5"
                            fill="white"
                            className="drop-shadow-[0_0_8px_white]"
                        />
                    )}

                </svg>
            </div>

            <div className="mt-6 flex items-center justify-between px-2">
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-[2px] bg-purple-500 shadow-[0_0_5px_rgba(168,85,247,0.5)]"></div>
                        <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">Daily VWAP</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-[2px] border-b border-dashed border-emerald-500"></div>
                        <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">Weekly Max</span>
                    </div>
                </div>
                <div className="text-[9px] font-black text-white/20 uppercase tracking-[0.2em] italic">
                    Neural Analytics Protocol © 2026
                </div>
            </div>
        </div>
    );
};
