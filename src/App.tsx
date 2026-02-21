import { useState, useEffect, useCallback } from 'react';
import type { CexTicker, VwapData } from './types';
import { fetchCexTickers, fetchWeeklyVwapData } from './services/cexService';
import { DecisionBuyAi } from './components/DecisionBuyAi';
import { Brain, Zap, Activity, Globe, RefreshCcw } from 'lucide-react';

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
      const newVwapStore: Record<string, VwapData> = { ...vwapStore };
      const newFirstSeen: Record<string, number> = { ...firstSeenTimes };

      const CHUNK_SIZE = 5;
      const DELAY_MS = 600;

      for (let i = 0; i < mainTickers.length; i += CHUNK_SIZE) {
        if (cancelled) break;
        const chunk = mainTickers.slice(i, i + CHUNK_SIZE);

        await Promise.all(chunk.map(async (t) => {
          try {
            const data = await fetchWeeklyVwapData(t.symbol);
            if (data) {
              newVwapStore[t.id] = data;
              if (!newFirstSeen[t.id]) {
                newFirstSeen[t.id] = Date.now();
              }
            }
          } catch (e) { }
        }));

        if (!cancelled) {
          setVwapStore({ ...newVwapStore });
          setFirstSeenTimes({ ...newFirstSeen });
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
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="flex flex-col items-center gap-6">
          <div className="relative">
            <div className="absolute inset-0 bg-purple-500/20 blur-3xl rounded-full animate-pulse"></div>
            <Brain className="w-16 h-16 text-purple-500 animate-bounce relative z-10" />
          </div>
          <div className="flex flex-col items-center gap-2">
            <h1 className="text-2xl font-black tracking-tighter text-white uppercase italic">VWAP SIGNAL AI</h1>
            <p className="text-xs text-purple-400/60 font-mono animate-pulse">Initializing market analytics engine...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-purple-500/30">
      {/* Dynamic Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-600/5 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600/5 blur-[120px] rounded-full"></div>
      </div>

      <div className="relative z-10 max-w-[1600px] mx-auto p-4 lg:p-8">
        {/* Top Navbar */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-purple-600 to-blue-600 rounded-2xl flex items-center justify-center shadow-[0_0_30px_rgba(168,85,247,0.3)]">
              <Zap className="w-8 h-8 text-white fill-white" />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tighter italic uppercase flex items-center gap-2">
                VWAP SIGNAL <span className="text-purple-500 leading-none">AI</span>
              </h1>
              <div className="flex items-center gap-3 mt-1">
                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                  <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Live Engine</span>
                </div>
                <span className="text-[10px] font-mono text-gray-500 uppercase">Updated: {lastUpdate.toLocaleTimeString()}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden lg:flex flex-col items-end">
              <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest leading-none mb-1 text-right">Market Scanning</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-black text-white italic">{tickers.length} Assets</span>
                <Globe className="w-4 h-4 text-purple-400" />
              </div>
            </div>
            <div className="h-10 w-[1px] bg-gray-800 hidden lg:block mx-2"></div>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-white/5 border border-white/10 hover:border-purple-500/50 hover:bg-purple-500/10 rounded-2xl transition-all flex items-center gap-3 backdrop-blur-md"
            >
              <RefreshCcw className={`w-4 h-4 text-purple-400 ${vwapLoading ? 'animate-spin' : ''}`} />
              <span className="text-sm font-black tracking-widest uppercase">Force Refresh</span>
            </button>
          </div>
        </header>

        {/* Main Content Area */}
        <div className="grid grid-cols-1 gap-8">
          <section className="animate-in fade-in slide-in-from-bottom-4 duration-1000">
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Activity className="w-5 h-5 text-purple-500" />
                <h2 className="text-sm font-black text-gray-400 uppercase tracking-[0.2em]">Alpha Generation Dashboard</h2>
              </div>
              {vwapLoading && (
                <div className="flex items-center gap-2 px-3 py-1 bg-purple-500/10 border border-purple-500/20 rounded-full animate-pulse">
                  <span className="text-[9px] font-black text-purple-400 uppercase">Calculating Weekly Statistics...</span>
                </div>
              )}
            </div>

            <DecisionBuyAi
              tickers={tickers}
              vwapStore={vwapStore}
              firstSeenTimes={firstSeenTimes}
              isLoading={vwapLoading}
              onTickerClick={(t) => window.open(`https://www.binance.com/en/trade/${t.symbol}_USDT`, '_blank')}
              onAddToWatchlist={() => { }}
            />
          </section>
        </div>
      </div>
    </div>
  );
}

export default App;
