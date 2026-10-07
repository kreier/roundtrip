export interface StationMetrics {
  queue_delay_ms?: number | null;
  execution_ms?: number | null;
  deploy_ms?: number | null;
  dispatch_out_ms?: number | null;
}

export interface StationStep {
  sequence: number;
  station_id: string;
  repo: string;
  received_at_utc?: string | null;
  workflow_started_at_utc?: string | null;
  deploy_completed_at_utc?: string | null;
  dispatched_next_at_utc?: string | null;
  metrics?: StationMetrics | null;
}

export interface BenchmarkInitiator {
  station_id: string;
  repo: string;
  trigger_type?: 'CRON' | 'MANUAL' | 'TEST' | string | null;
  scheduled_time_utc?: string | null;
  actual_start_utc?: string | null;
  cron_jitter_ms?: number | null;
}

export interface BenchmarkSummary {
  total_roundtrip_ms?: number | null;
  stations_count?: number | null;
  round_completed_at_utc?: string | null;
}

export interface BenchmarkRun {
  round_id: string;
  trigger_type?: 'CRON' | 'MANUAL' | 'TEST' | string | null;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | string;
  initiator: BenchmarkInitiator;
  summary: BenchmarkSummary;
  stations: StationStep[];
}

export interface TelemetryDatabase {
  $schema?: string;
  version?: string;
  station_id: string;
  runs: BenchmarkRun[];
}
