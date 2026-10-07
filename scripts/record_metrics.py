#!/usr/bin/env python3
"""
scripts/record_metrics.py
Records execution metrics, cron jitter, queue delays, and deployment durations
into data/runs.json for the current station and cycle.
"""

import argparse
import datetime
import json
import os
import sys

DEFAULT_DATA_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "data",
    "runs.json",
)


def parse_iso(ts_str: str) -> datetime.datetime:
    if not ts_str:
        return None
    # Normalize ISO ending in Z to +00:00 for fromisoformat compatibility
    if ts_str.endswith("Z"):
        ts_str = ts_str[:-1] + "+00:00"
    return datetime.datetime.fromisoformat(ts_str)


def to_iso(dt: datetime.datetime) -> str:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=datetime.timezone.utc)
    return dt.astimezone(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def delta_ms(start_ts: str, end_ts: str) -> int:
    if not start_ts or not end_ts:
        return 0
    t0 = parse_iso(start_ts)
    t1 = parse_iso(end_ts)
    if t0 and t1:
        return int((t1 - t0).total_seconds() * 1000)
    return 0


def load_database(filepath: str) -> dict:
    if os.path.exists(filepath):
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"Warning: Failed to parse existing {filepath}: {e}", file=sys.stderr)

    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "version": "1.0.0",
        "station_id": os.getenv("STATION_ID", "unknown-station"),
        "runs": [],
    }


def infer_trigger_type(round_id: str, explicit_type: str = None) -> str:
    if explicit_type and explicit_type.upper() in ("CRON", "MANUAL", "TEST"):
        return explicit_type.upper()
    rid_upper = (round_id or "").upper()
    if "TEST" in rid_upper:
        return "TEST"
    if "MANUAL" in rid_upper:
        return "MANUAL"
    if "CRON" in rid_upper:
        return "CRON"
    return "CRON"


def record_station_run(
    data_path: str,
    round_id: str,
    is_initiator: bool,
    station_id: str,
    repo: str,
    sequence: int,
    received_at: str,
    workflow_started_at: str,
    deploy_completed_at: str = None,
    dispatched_next_at: str = None,
    scheduled_time: str = None,
    incoming_payload: dict = None,
    is_loop_closure: bool = False,
    trigger_type: str = None,
):
    db = load_database(data_path)
    db["station_id"] = station_id

    resolved_type = infer_trigger_type(
        round_id,
        trigger_type
        or (incoming_payload.get("initiator", {}).get("trigger_type") if incoming_payload else None),
    )

    # Find existing run or create new
    run = None
    for r in db["runs"]:
        if r.get("round_id") == round_id:
            run = r
            break

    if not run:
        # Construct initiator block
        if incoming_payload and incoming_payload.get("initiator"):
            initiator_info = incoming_payload["initiator"]
            if "trigger_type" not in initiator_info:
                initiator_info["trigger_type"] = resolved_type
        elif is_initiator:
            jitter = delta_ms(scheduled_time, workflow_started_at) if scheduled_time else 0
            initiator_info = {
                "station_id": station_id,
                "repo": repo,
                "trigger_type": resolved_type,
                "scheduled_time_utc": scheduled_time or workflow_started_at,
                "actual_start_utc": workflow_started_at,
                "cron_jitter_ms": jitter,
            }
        else:
            initiator_info = {
                "station_id": "unknown",
                "repo": "unknown",
                "trigger_type": resolved_type,
                "scheduled_time_utc": None,
                "actual_start_utc": None,
                "cron_jitter_ms": 0,
            }

        run = {
            "round_id": round_id,
            "trigger_type": resolved_type,
            "status": "IN_PROGRESS",
            "initiator": initiator_info,
            "summary": {
                "total_roundtrip_ms": None,
                "stations_count": 0,
                "round_completed_at_utc": None,
            },
            "stations": [],
        }
        db["runs"].append(run)
    else:
        if "trigger_type" not in run:
            run["trigger_type"] = resolved_type

    # Copy previous trace stations if available from incoming payload
    if incoming_payload and "trace" in incoming_payload:
        existing_seqs = {s["sequence"] for s in run["stations"]}
        for t in incoming_payload["trace"]:
            if t["sequence"] not in existing_seqs:
                run["stations"].append(
                    {
                        "sequence": t["sequence"],
                        "station_id": t.get("station_id"),
                        "repo": t.get("repo"),
                        "received_at_utc": t.get("received_at_utc"),
                        "workflow_started_at_utc": t.get("received_at_utc"),
                        "deploy_completed_at_utc": t.get("completed_at_utc"),
                        "dispatched_next_at_utc": t.get("dispatched_next_at_utc"),
                        "metrics": {
                            "execution_ms": t.get("duration_ms", 0),
                        },
                    }
                )

    # Calculate local metrics
    queue_delay = delta_ms(received_at, workflow_started_at)
    execution_time = delta_ms(workflow_started_at, deploy_completed_at) if deploy_completed_at else 0
    dispatch_out = delta_ms(deploy_completed_at, dispatched_next_at) if (deploy_completed_at and dispatched_next_at) else 0

    station_entry = {
        "sequence": sequence,
        "station_id": station_id,
        "repo": repo,
        "received_at_utc": received_at,
        "workflow_started_at_utc": workflow_started_at,
        "deploy_completed_at_utc": deploy_completed_at,
        "dispatched_next_at_utc": dispatched_next_at,
        "metrics": {
            "queue_delay_ms": max(0, queue_delay),
            "execution_ms": max(0, execution_time),
            "dispatch_out_ms": max(0, dispatch_out),
        },
    }

    # Upsert station entry
    replaced = False
    for i, s in enumerate(run["stations"]):
        if s["sequence"] == sequence and s["station_id"] == station_id:
            run["stations"][i] = station_entry
            replaced = True
            break
    if not replaced:
        run["stations"].append(station_entry)

    # Sort stations by sequence
    run["stations"].sort(key=lambda x: x["sequence"])
    run["summary"]["stations_count"] = len(run["stations"])

    # If this is loop closure (Initiator receiving final hop)
    if is_loop_closure and is_initiator:
        run["status"] = "COMPLETED"
        init_start = (run.get("initiator") or {}).get("actual_start_utc")
        if not init_start and run.get("stations"):
            init_start = run["stations"][0].get("workflow_started_at_utc")
        if not init_start:
            init_start = workflow_started_at
        completed_ts = deploy_completed_at or dispatched_next_at or to_iso(datetime.datetime.now(datetime.timezone.utc))
        run["summary"]["round_completed_at_utc"] = completed_ts
        run["summary"]["total_roundtrip_ms"] = delta_ms(init_start, completed_ts)

    # Ensure parent directory exists
    os.makedirs(os.path.dirname(data_path), exist_ok=True)
    with open(data_path, "w", encoding="utf-8") as f:
        json.dump(db, f, indent=2)

    print(f"Recorded run metrics for station '{station_id}' in {data_path} (round {round_id})")
    return run


def main():
    parser = argparse.ArgumentParser(description="Record roundtrip station telemetry to data/runs.json")
    parser.add_argument("--data-path", default=DEFAULT_DATA_PATH)
    parser.add_argument("--round-id", required=True)
    parser.add_argument("--station-id", default=os.getenv("STATION_ID", "station-0"))
    parser.add_argument("--repo", default=os.getenv("GITHUB_REPOSITORY", "kreier/roundtrip"))
    parser.add_argument("--sequence", type=int, default=0)
    parser.add_argument("--is-initiator", action="store_true")
    parser.add_argument("--is-loop-closure", action="store_true")
    parser.add_argument("--received-at")
    parser.add_argument("--workflow-started-at")
    parser.add_argument("--deploy-completed-at")
    parser.add_argument("--dispatched-next-at")
    parser.add_argument("--scheduled-time")
    parser.add_argument("--incoming-payload-file")
    parser.add_argument("--trigger-type", choices=["CRON", "MANUAL", "TEST"], help="Execution trigger category")

    args = parser.parse_args()

    incoming_payload = None
    if args.incoming_payload_file and os.path.exists(args.incoming_payload_file):
        with open(args.incoming_payload_file, "r", encoding="utf-8") as f:
            incoming_payload = json.load(f)

    now_iso = to_iso(datetime.datetime.now(datetime.timezone.utc))
    started_at = args.workflow_started_at or now_iso
    received_at = args.received_at or started_at

    record_station_run(
        data_path=args.data_path,
        round_id=args.round_id,
        is_initiator=args.is_initiator,
        station_id=args.station_id,
        repo=args.repo,
        sequence=args.sequence,
        received_at=received_at,
        workflow_started_at=started_at,
        deploy_completed_at=args.deploy_completed_at,
        dispatched_next_at=args.dispatched_next_at,
        scheduled_time=args.scheduled_time,
        incoming_payload=incoming_payload,
        is_loop_closure=args.is_loop_closure,
        trigger_type=args.trigger_type,
    )


if __name__ == "__main__":
    main()
