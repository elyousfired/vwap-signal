import { useState, useEffect, useCallback } from 'react';
import type { CexTicker, VwapData } from './types';
import { fetchCexTickers, fetchWeeklyVwapData } from './services/cexService';
import { DecisionBuyAi } from './components/DecisionBuyAi';
import { Brain, Zap, Globe, RefreshCcw } from 'lucide-react';

function App() {
  const [tickers, setTickers] = useState<CexTicker[]>([]);
  const [vwapStore, setVwapStore] = useState<Record<string, VwapData>>({});
  const [firstSeenTimes, setFirstSeenTimes] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [vwapLoading, setVwapLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const loadInitialData = useCallback(async () => {
    try {
      const data = await fetchCexTickers();
      setTickers(data);
      setLoading(false);
    } catch (error) {
      console.error('Failed to load tickers:', error);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInitialData();
    const tickerInterval = setInterval(loadInitialData, 60000);
    return () => clearInterval(tickerInterval);
  }, [loadInitialData]);

  // VWAP Signal Polling Logic (Standalone Engine)
  useEffect(() => {
    if (tickers.length === 0) return;

    let cancelled = false;
    const mainTickers = tickers
      .filter(t => t.volume24h > 500000)
      .slice(0, 150);

    const fetchSignals = async () => {
      setVwapLoading(true);

      const CHUNK_SIZE = 15; // Increased from 5
      const DELAY_MS = 200; // Reduced from 600

      // Batch updates to reduce re-renders
      let pendingVwapStore = { ...vwapStore };
      let pendingFirstSeen = { ...firstSeenTimes };

      for (let i = 0; i < mainTickers.length; i += CHUNK_SIZE) {
        if (cancelled) break;
        const chunk = mainTickers.slice(i, i + CHUNK_SIZE);

        await Promise.all(chunk.map(async (t) => {
          try {
            const data = await fetchWeeklyVwapData(t.symbol);
            if (data) {
              pendingVwapStore[t.id] = data;
              if (!pendingFirstSeen[t.id]) {
                pendingFirstSeen[t.id] = Date.now();
              }
            }
          } catch (e) { }
        }));

        // Intermediate batch update for UX
        if (!cancelled && (i % 30 === 0 || i + CHUNK_SIZE >= mainTickers.length)) {
          setVwapStore({ ...pendingVwapStore });
          setFirstSeenTimes({ ...pendingFirstSeen });
        }

        if (i + CHUNK_SIZE < mainTickers.length) {
          await new Promise(r => setTimeout(r, DELAY_MS));
        }
      }

      if (!cancelled) {
        setVwapLoading(false);
        setLastUpdate(new Date());
      }
    };

    fetchSignals();
    const signalInterval = setInterval(fetchSignals, 120000);
    return () => {
      cancelled = true;
      clearInterval(signalInterval);
    };
  }, [tickers.length > 0]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#020202] flex items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-8 relative">
          <div className="absolute inset-x-[-100%] inset-y-[-100%] bg-purple-500/10 blur-[120px] rounded-full animate-pulse-slow"></div>
          <div className="relative group">
            <div className="absolute inset-0 bg-purple-500/30 blur-2xl rounded-full group-hover:bg-purple-500/50 transition-all duration-700"></div>
            <div className="w-24 h-24 bg-black/40 backdrop-blur-3xl rounded-3xl border border-purple-500/30 flex items-center justify-center relative z-10 glow-purple">
              <Brain className="w-12 h-12 text-purple-400 animate-float" />
            </div>
          </div>
          <div className="flex flex-col items-center gap-3">
            <h1 className="text-3xl font-black tracking-[-0.05em] text-white uppercase italic text-glow-purple">
              VWAP SIGNAL <span className="text-purple-500">AI</span>
            </h1>
            <div className="flex items-center gap-2">
              <div className="w-1 h-1 bg-purple-500 rounded-full animate-ping"></div>
              <p className="text-[10px] text-purple-400/60 font-black tracking-[0.2em] uppercase">Booting Analytics Engine</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020202] text-white selection:bg-purple-500/30 font-sans">
      {/* Dynamic Ambient Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-purple-900/10 blur-[180px] rounded-full animate-pulse-slow"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-900/10 blur-[150px] rounded-full animate-pulse-slow" style={{ animationDelay: '2s' }}></div>
        <div className="absolute top-[30%] left-[40%] w-[30%] h-[30%] bg-purple-600/5 blur-[120px] rounded-full animate-float"></div>
      </div>

      {/* Floating Modern Header */}
      <div className="sticky top-0 z-50 p-4 lg:p-6">
        <header className="max-w-[1500px] mx-auto glass-panel rounded-3xl p-4 lg:px-8 lg:py-4 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-tr from-purple-600 to-blue-600 blur-xl opacity-40 group-hover:opacity-70 transition-opacity"></div>
              <div className="w-14 h-14 bg-gradient-to-br from-purple-600 to-blue-600 rounded-2xl flex items-center justify-center relative z-10 shadow-2xl">
                <Zap className="w-8 h-8 text-white fill-white animate-pulse-slow" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-black tracking-tighter italic uppercase flex items-center gap-2 gradient-text">
                  VWAP SIGNAL <span className="text-purple-500 leading-none">AI</span>
                </h1>
                <div className="px-2 py-0.5 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                  <span className="text-[8px] font-black text-purple-400 uppercase tracking-widest">PRO v1.0</span>
                </div>
              </div>
              <div className="flex items-center gap-3 mt-1.5">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                  <span className="text-[9px] font-black text-emerald-400/80 uppercase tracking-widest">Engine Active</span>
                </div>
                <div className="w-[1px] h-3 bg-white/10"></div>
                <span className="text-[9px] font-bold text-white/30 uppercase tracking-tight">Sync: {lastUpdate.toLocaleTimeString()}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="hidden lg:flex flex-col items-end gap-1">
              <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.2em] leading-none">Market Coverage</span>
              <div className="flex items-center gap-2">
                <span className="text-base font-black text-white italic tracking-tight">{tickers.length} Symbols</span>
                <div className="p-1 bg-white/5 rounded-lg border border-white/10">
                  <Globe className="w-3.5 h-3.5 text-purple-400" />
                </div>
              </div>
            </div>

            <button
              onClick={() => window.location.reload()}
              className="group px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-purple-500/40 rounded-2xl transition-all flex items-center gap-3 active:scale-95 overflow-hidden relative"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-purple-600/0 via-purple-600/10 to-purple-600/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
              <RefreshCcw className={`w-4 h-4 text-purple-400 transition-transform group-hover:rotate-180 ${vwapLoading ? 'animate-spin' : ''}`} />
              <span className="text-xs font-black tracking-[0.1em] uppercase text-white/80 group-hover:text-white">Refresh Analytics</span>
            </button>
          </div>
        </header>
      </div>

      <main className="relative z-10 max-w-[1550px] mx-auto p-4 lg:p-10">
        {/* Main Content Area */}
        <div className="grid grid-cols-1 gap-12">
          <section className="animate-in fade-in slide-in-from-bottom-8 duration-1000">
            <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4 px-2">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-[2px] bg-purple-500 rounded-full"></div>
                  <h2 className="text-[10px] font-black text-purple-500 uppercase tracking-[0.4em]">Market Alpha Engine</h2>
                </div>
                <h3 className="text-3xl font-black text-white tracking-tight uppercase italic">Decision Matrix</h3>
              </div>

              {vwapLoading && (
                <div className="flex items-center gap-3 px-4 py-2 bg-purple-500/5 border border-purple-500/10 rounded-2xl backdrop-blur-md">
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                    <div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                    <div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce"></div>
                  </div>
                  <span className="text-[10px] font-black text-purple-400/80 uppercase tracking-widest">Crunching Global VWAP Statistics...</span>
                </div>
              )}
            </div>

            <div className="glass-panel rounded-[2.5rem] p-1 bg-white/[0.02]">
              <DecisionBuyAi
                tickers={tickers}
                vwapStore={vwapStore}
                firstSeenTimes={firstSeenTimes}
                isLoading={vwapLoading}
                onTickerClick={(t) => window.open(`https://www.binance.com/en/trade/${t.symbol}_USDT`, '_blank')}
                onAddToWatchlist={() => { }}
              />
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

export default App;
