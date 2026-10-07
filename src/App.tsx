import React, { useState, useEffect } from 'react';
import initialRunsData from '../data/runs.json';
import { TelemetryDatabase, BenchmarkRun } from './types';
import { GanttChart } from './components/GanttChart';
import { RingTopology } from './components/RingTopology';

type CategoryFilter = 'ALL' | 'CRON' | 'MANUAL' | 'TEST';

const STORAGE_KEY_HIDDEN = 'roundtrip_hidden_runs';
const STORAGE_KEY_CATEGORY = 'roundtrip_category_filter';

export const getRunCategory = (run: BenchmarkRun): 'CRON' | 'MANUAL' | 'TEST' => {
  if (run.trigger_type) {
    const t = run.trigger_type.toUpperCase();
    if (t === 'TEST' || t === 'MANUAL' || t === 'CRON') return t;
  }
  if (run.initiator?.trigger_type) {
    const t = run.initiator.trigger_type.toUpperCase();
    if (t === 'TEST' || t === 'MANUAL' || t === 'CRON') return t;
  }
  const idUpper = (run.round_id || '').toUpperCase();
  if (idUpper.includes('TEST')) return 'TEST';
  if (idUpper.includes('MANUAL')) return 'MANUAL';
  return 'CRON';
};

export const App: React.FC = () => {
  const [db] = useState<TelemetryDatabase>(initialRunsData as unknown as TelemetryDatabase);
  const [hiddenRunIds, setHiddenRunIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_HIDDEN);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CATEGORY);
      if (saved && ['ALL', 'CRON', 'MANUAL', 'TEST'].includes(saved)) {
        return saved as CategoryFilter;
      }
    } catch {
      // ignore
    }
    return 'ALL';
  });

  const [selectedRoundIndex, setSelectedRoundIndex] = useState(0);

  // Sync state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_HIDDEN, JSON.stringify(hiddenRunIds));
    } catch {
      // ignore
    }
  }, [hiddenRunIds]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_CATEGORY, categoryFilter);
    } catch {
      // ignore
    }
  }, [categoryFilter]);

  // Compute visible runs based on active filters
  const visibleRuns = (db.runs || []).filter((r) => {
    if (hiddenRunIds.includes(r.round_id)) return false;
    if (categoryFilter !== 'ALL' && getRunCategory(r) !== categoryFilter) {
      return false;
    }
    return true;
  });

  // Clamp selected round index
  const safeIndex = Math.min(selectedRoundIndex, Math.max(0, visibleRuns.length - 1));
  const activeRun: BenchmarkRun | null = visibleRuns.length > 0 ? visibleRuns[safeIndex] : null;

  const isLoopCompleted = activeRun?.status === 'COMPLETED';
  const jitterMs = activeRun?.initiator?.cron_jitter_ms || 0;
  const totalMs = activeRun?.summary?.total_roundtrip_ms;
  const activeCategory = activeRun ? getRunCategory(activeRun) : 'CRON';

  const handleHideRun = (roundId: string) => {
    if (window.confirm(`Hide benchmark run '${roundId}' from your dashboard view?`)) {
      setHiddenRunIds((prev) => [...prev, roundId]);
      setSelectedRoundIndex(0);
    }
  };

  const handleRestoreAll = () => {
    setHiddenRunIds([]);
    setCategoryFilter('ALL');
  };

  const handleDownloadCleanRuns = () => {
    const cleanDb: TelemetryDatabase = {
      ...db,
      runs: visibleRuns,
    };
    const jsonStr = JSON.stringify(cleanDb, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'runs.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Navigation & Header */}
        <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-3xl">🔄</span>
              <h1 className="text-2xl font-bold tracking-tight text-white">Roundtrip Benchmark</h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-blue-500/20 text-blue-300 border border-blue-500/30">
                v1.0.0
              </span>
            </div>
            <p className="text-sm text-slate-400 mt-1">
              Decentralized multi-account GitHub Actions execution latency & relay benchmark.
            </p>
          </div>

          <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 p-2 rounded-xl text-xs font-mono">
            <span className="text-slate-400">Current Station:</span>
            <span className="px-2 py-1 rounded bg-slate-800 text-blue-400 font-semibold">
              {db.station_id || 'kreier-station-0'}
            </span>
          </div>
        </header>

        {/* Top Summary Cards */}
        {activeRun ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-lg relative group">
              <div className="flex items-center justify-between">
                <div className="text-xs font-mono text-slate-400 uppercase tracking-wider">Active Round</div>
                <button
                  onClick={() => handleHideRun(activeRun.round_id)}
                  className="text-slate-500 hover:text-rose-400 text-xs transition-colors"
                  title="Hide this run from view"
                >
                  ✕ Hide
                </button>
              </div>
              <div className="text-xl font-bold font-mono text-slate-100 mt-2 truncate">
                {activeRun.round_id}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Started {activeRun.initiator?.scheduled_time_utc?.slice(0, 10) || 'N/A'}
              </div>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-lg">
              <div className="text-xs font-mono text-slate-400 uppercase tracking-wider">Loop Status</div>
              <div className="flex items-center gap-2 mt-2">
                <span
                  className={`w-3 h-3 rounded-full ${
                    isLoopCompleted ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                  }`}
                />
                <span className="text-xl font-bold font-mono text-slate-100">
                  {activeRun.status}
                </span>
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {activeRun.summary?.stations_count || activeRun.stations.length} stations traversed
              </div>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-lg">
              <div className="text-xs font-mono text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>
                  {activeCategory === 'CRON'
                    ? `Cron Jitter (${activeRun.initiator?.scheduled_time_utc ? new Date(activeRun.initiator.scheduled_time_utc).toISOString().slice(11, 16) : '03:14'} UTC)`
                    : 'Runner Queue Wait'}
                </span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded border uppercase font-bold ${
                    activeCategory === 'CRON'
                      ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                      : activeCategory === 'MANUAL'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                  }`}
                >
                  {activeCategory}
                </span>
              </div>
              <div className="text-xl font-bold font-mono text-amber-400 mt-2">
                {jitterMs ? `+${(jitterMs / 1000).toFixed(2)}s` : '0.00s'}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {activeCategory === 'CRON'
                  ? `${jitterMs.toLocaleString()} ms scheduler delay`
                  : `${jitterMs.toLocaleString()} ms runner startup latency`}
              </div>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-lg">
              <div className="text-xs font-mono text-slate-400 uppercase tracking-wider">Total Roundtrip</div>
              <div className="text-xl font-bold font-mono text-emerald-400 mt-2">
                {totalMs ? `${(totalMs / 1000).toFixed(1)}s` : 'In Progress...'}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {totalMs ? `${totalMs.toLocaleString()} ms cycle latency` : 'Awaiting return signal'}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-8 text-center text-slate-400 bg-slate-900 rounded-xl border border-slate-800 flex flex-col items-center gap-3">
            <div>No benchmark runs visible (some may be hidden or filtered).</div>
            {(hiddenRunIds.length > 0 || categoryFilter !== 'ALL') && (
              <button
                onClick={handleRestoreAll}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-mono font-semibold transition-colors"
              >
                Restore All Hidden Runs & Reset Filters
              </button>
            )}
          </div>
        )}

        {/* Visualizers: Gantt Chart and Ring Topology */}
        {activeRun && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <GanttChart stations={activeRun.stations} cronJitterMs={jitterMs} triggerType={activeCategory} />
            </div>
            <div>
              <RingTopology
                stations={activeRun.stations}
                currentStationId={db.station_id}
                isLoopCompleted={isLoopCompleted}
              />
            </div>
          </div>
        )}

        {/* Historical Rounds Selector & Management Toolbar */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-md font-semibold text-slate-200">Historical Benchmark Runs</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Select a cycle to view telemetry, filter by category, or download a clean database.
              </p>
            </div>

            {/* Run Management Toolbar */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Category Filter Pills */}
              <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs font-mono">
                {(['ALL', 'CRON', 'MANUAL', 'TEST'] as CategoryFilter[]).map((cat) => {
                  const isActive = categoryFilter === cat;
                  const label =
                    cat === 'ALL'
                      ? 'All'
                      : cat === 'CRON'
                      ? '⏰ Cron'
                      : cat === 'MANUAL'
                      ? '👤 Manual'
                      : '🧪 Test';
                  return (
                    <button
                      key={cat}
                      onClick={() => setCategoryFilter(cat)}
                      className={`px-2.5 py-1 rounded text-xs transition-colors ${
                        isActive
                          ? 'bg-blue-600 text-white font-semibold'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* Restore All Button */}
              {hiddenRunIds.length > 0 && (
                <button
                  onClick={handleRestoreAll}
                  className="px-3 py-1.5 rounded-lg text-xs font-mono bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                  title="Restore hidden runs back into view"
                >
                  Restore ({hiddenRunIds.length})
                </button>
              )}

              {/* Download Clean JSON Button */}
              <button
                onClick={handleDownloadCleanRuns}
                className="px-3 py-1.5 rounded-lg text-xs font-mono bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 border border-blue-500/40 font-semibold transition-colors flex items-center gap-1.5"
                title="Download the currently visible runs as a clean runs.json file"
              >
                <span>💾</span> Download runs.json
              </button>
            </div>
          </div>

          {/* Run Selection Pills */}
          {visibleRuns.length > 0 ? (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-800/80">
              {visibleRuns.map((r, i) => {
                const isSelected = i === safeIndex;
                const cat = getRunCategory(r);

                return (
                  <div
                    key={r.round_id}
                    className={`flex items-center rounded-lg text-xs font-mono transition-colors ${
                      isSelected
                        ? 'bg-blue-600 text-white font-bold'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    <button
                      onClick={() => setSelectedRoundIndex(i)}
                      className="px-3 py-1.5 flex items-center gap-1.5"
                    >
                      <span
                        className={`text-[9px] px-1 py-0.2 rounded uppercase font-semibold ${
                          cat === 'CRON'
                            ? 'bg-purple-900/60 text-purple-300 border border-purple-700/60'
                            : cat === 'MANUAL'
                            ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-700/60'
                            : 'bg-amber-900/60 text-amber-300 border border-amber-700/60'
                        }`}
                      >
                        {cat}
                      </span>
                      <span>{r.round_id}</span>
                      <span className="text-[10px] opacity-75">({r.status})</span>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleHideRun(r.round_id);
                      }}
                      className="pr-2 pl-0.5 text-slate-400 hover:text-rose-300 text-xs"
                      title={`Hide ${r.round_id}`}
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-xs text-slate-500 italic py-2">
              All runs are currently filtered out. Click &quot;Restore&quot; to show all.
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="pt-6 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-4">
          <div>
            Built with Vite, React & TypeScript • Powered by GitHub Actions & GitHub App
          </div>
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/kreier/roundtrip"
              target="_blank"
              rel="noreferrer"
              className="text-blue-400 hover:underline"
            >
              GitHub Repository
            </a>
            <span>•</span>
            <a
              href="https://github.com/kreier/roundtrip/blob/main/docs/ARCHITECTURE.md"
              target="_blank"
              rel="noreferrer"
              className="text-blue-400 hover:underline"
            >
              Architecture Docs
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default App;
