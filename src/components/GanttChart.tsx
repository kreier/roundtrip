import React from 'react';
import { StationStep } from '../types';

export type { StationStep };

interface GanttChartProps {
  stations: StationStep[];
  cronJitterMs?: number;
  triggerType?: string;
}

export const GanttChart: React.FC<GanttChartProps> = ({
  stations,
  cronJitterMs = 0,
  triggerType = 'CRON',
}) => {
  if (!stations || stations.length === 0) {
    return (
      <div className="p-8 text-center text-slate-400 bg-slate-900/50 rounded-xl border border-slate-800">
        No station telemetry data available for this cycle.
      </div>
    );
  }

  // Find base time for global timeline
  const firstTimestamp = stations.find((s) => s.received_at_utc || s.dispatched_next_at_utc);
  const baseTimeMs = firstTimestamp
    ? new Date((firstTimestamp.received_at_utc || firstTimestamp.dispatched_next_at_utc)!).getTime()
    : null;

  // Build sequential timeline entries with cumulative offsets (waterfall effect)
  let runningOffsetMs = cronJitterMs;
  const timelineEntries = stations.map((st, idx) => {
    const queue = st.metrics?.queue_delay_ms ?? (idx === 0 ? cronJitterMs : 2500);
    const exec = st.metrics?.execution_ms ?? 42000;
    const deploy = st.metrics?.deploy_ms ?? Math.round(exec * 0.6);
    const run = Math.max(0, exec - deploy);
    const dispatch = st.metrics?.dispatch_out_ms ?? 2800;
    const totalStepMs = queue + exec + dispatch;

    let startOffsetMs = runningOffsetMs;

    // If timestamps are available relative to base time
    if (baseTimeMs !== null) {
      const ts = st.received_at_utc || st.workflow_started_at_utc || st.dispatched_next_at_utc;
      if (ts) {
        const delta = new Date(ts).getTime() - baseTimeMs;
        if (delta >= 0) {
          startOffsetMs = delta;
        }
      }
    }

    // Keep running offset advancing monotonically
    runningOffsetMs = Math.max(runningOffsetMs + totalStepMs, startOffsetMs + totalStepMs);

    return {
      station: st,
      startOffsetMs,
      queue,
      run,
      deploy,
      dispatch,
      totalStepMs,
    };
  });

  const totalTimelineMs = Math.max(runningOffsetMs, 10000);
  const totalSeconds = (totalTimelineMs / 1000).toFixed(0);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <span>⏱️</span> Execution Phase Breakdown (Gantt)
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Visualizing runner queue wait, execution, Pages deployment, and relay dispatch latency over time.
          </p>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-amber-500"></span>
            <span className="text-slate-300">
              {triggerType === 'CRON' ? 'Cron Jitter' : 'Runner Queue Delay'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-sky-500"></span>
            <span className="text-slate-300">Execution</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-emerald-500"></span>
            <span className="text-slate-300">Pages Deploy</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-purple-500"></span>
            <span className="text-slate-300">Dispatch Next</span>
          </div>
        </div>
      </div>

      {/* Global Timeline Axis */}
      <div className="mb-4 pb-2 border-b border-slate-800 text-[10px] font-mono text-slate-500 flex justify-between select-none">
        <span>0s (Start)</span>
        <span>+{(totalTimelineMs / 4000).toFixed(0)}s</span>
        <span>+{(totalTimelineMs / 2000).toFixed(0)}s</span>
        <span>+{((totalTimelineMs * 3) / 4000).toFixed(0)}s</span>
        <span>+{totalSeconds}s (Total)</span>
      </div>

      <div className="space-y-4">
        {timelineEntries.map((entry, idx) => {
          const st = entry.station;
          const offsetPct = (entry.startOffsetMs / totalTimelineMs) * 100;
          const queuePct = Math.max(0.5, (entry.queue / totalTimelineMs) * 100);
          const runPct = Math.max(1, (entry.run / totalTimelineMs) * 100);
          const deployPct = Math.max(1, (entry.deploy / totalTimelineMs) * 100);
          const dispatchPct = Math.max(0.5, (entry.dispatch / totalTimelineMs) * 100);

          return (
            <div key={st.station_id ? `${st.station_id}-${st.sequence}` : idx} className="bg-slate-950/60 p-4 rounded-lg border border-slate-800/80">
              <div className="flex items-center justify-between text-xs font-mono mb-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-bold">
                    Hop #{st.sequence}
                  </span>
                  <span className="text-slate-100 font-semibold">{st.station_id}</span>
                  <span className="text-slate-500">({st.repo})</span>
                </div>
                <div className="flex items-center gap-3 text-slate-400">
                  <span className="text-[11px] text-slate-500">
                    t+{(entry.startOffsetMs / 1000).toFixed(1)}s
                  </span>
                  <span>
                    Duration: {Math.round(entry.totalStepMs / 1000)}s
                  </span>
                </div>
              </div>

              {/* Progress bar representing timeline */}
              <div className="h-6 w-full bg-slate-900 rounded overflow-hidden flex text-[10px] text-white font-mono select-none">
                {/* Left offset spacer for waterfall cascade */}
                {offsetPct > 0 && (
                  <div
                    style={{ width: `${Math.min(offsetPct, 95)}%` }}
                    className="shrink-0 bg-transparent"
                  />
                )}

                {/* Queue / Jitter */}
                <div
                  style={{ width: `${queuePct}%` }}
                  className="bg-amber-500 hover:bg-amber-400 flex items-center justify-center transition-colors truncate px-1 shrink-0"
                  title={`Queue delay / Jitter: ${entry.queue.toLocaleString()} ms`}
                >
                  {entry.queue > 4000 ? `${(entry.queue / 1000).toFixed(1)}s` : ''}
                </div>

                {/* Workflow Execution */}
                <div
                  style={{ width: `${runPct}%` }}
                  className="bg-sky-600 hover:bg-sky-500 flex items-center justify-center transition-colors truncate px-1 shrink-0"
                  title={`Execution: ${entry.run.toLocaleString()} ms`}
                >
                  {entry.run > 5000 ? `${(entry.run / 1000).toFixed(1)}s` : ''}
                </div>

                {/* Pages Deploy */}
                <div
                  style={{ width: `${deployPct}%` }}
                  className="bg-emerald-600 hover:bg-emerald-500 flex items-center justify-center transition-colors truncate px-1 shrink-0"
                  title={`Pages Deploy: ${entry.deploy.toLocaleString()} ms`}
                >
                  {entry.deploy > 5000 ? `${(entry.deploy / 1000).toFixed(1)}s` : ''}
                </div>

                {/* Dispatch Out */}
                <div
                  style={{ width: `${dispatchPct}%` }}
                  className="bg-purple-600 hover:bg-purple-500 flex items-center justify-center transition-colors truncate px-1 shrink-0"
                  title={`App Dispatch: ${entry.dispatch.toLocaleString()} ms`}
                >
                  {entry.dispatch > 3000 ? `${(entry.dispatch / 1000).toFixed(1)}s` : ''}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
