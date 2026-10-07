# Agent Guidelines & Project Instructions (AGENTS.md)

Welcome to **Roundtrip**. This document serves as the primary operational and architectural guide for AI coding assistants and developers contributing to this codebase.

---

## 1. Project Mission & Core Concept

**Roundtrip** is a distributed, multi-account GitHub Actions benchmark and visualizer that tracks the propagation of an execution signal through a ring topology of GitHub repositories (stations).

- **Execution Cadence**: Initiated once per month at **3:14 AM UTC** on a randomly selected day ($1 \le D \le 30$) by an elected **Initiating Station**.
- **Jitter & Execution Telemetry**: Measures GitHub Actions cron trigger delay, workflow execution duration, GitHub Pages deployment time, and inter-repository dispatch latency.
- **Ring Topology**: Each station executes its workflow, records telemetry, builds and deploys its visual interface to GitHub Pages, and triggers the next station in sequence using a **GitHub App**.
- **History & Reconstruction**: Each station reconstructs the prior cycle's complete loop path (tracing from the next station backwards to the initiator and back to itself) before passing the signal forward.
- **Loop Closure**: When the signal returns to the initiator, the cycle completes, metrics are sealed, and the initiator selects and commits a new random start day for the subsequent month.

---

## 2. Inviolable Architectural Principles

When modifying, extending, or debugging this repository, agents **must** adhere to these core principles:

### A. Non-Destructive Upstream Synchronization
Forks and clones must be able to pull and merge changes from `kreier/roundtrip:main` without:
- Overwriting station-specific configuration.
- Creating git merge conflicts during automated or manual syncs.
- Storing station secrets or credentials in tracked git files.
*Rule: Station identity and routing configuration must be read from environment variables / GitHub repository variables (`STATION_*`), or a local untracked `.roundtrip/config.json` populated from a committed template (`config.template.json`).*

### B. App-Based Authentication (No Personal Access Tokens)
- Inter-station dispatches **must** authenticate using a **GitHub App** installed across all participating accounts.
- Workflows must request short-lived installation access tokens (using `APP_ID` and `APP_PRIVATE_KEY` stored in repository secrets) rather than Personal Access Tokens (PATs).
- Never introduce code, scripts, or examples requesting or storing personal PATs.

### C. The In-Order Deployment & Trigger Chain
To ensure telemetry and public state remain deterministic:
1. **Receive Signal / Trigger**: Validate incoming payload.
2. **Reconstruct Previous Round**: Fetch previous run metrics across the loop.
3. **Record Station Metrics**: Log received timestamp, start timestamp, execution metrics to the local database.
4. **Build & Deploy Pages**: Build the Vite React dashboard and deploy to GitHub Pages.
5. **Dispatch Next Station**: Only trigger the next station **after** the Pages deployment succeeds.

### D. Zero Breaking Changes to the Protocol
The payload schema exchanged between stations via `repository_dispatch` (event: `roundtrip_signal`) must maintain backwards and forwards compatibility. See [docs/PROTOCOL.md](file:///home/mk/AI-Agents/antigravity/roundtrip/docs/PROTOCOL.md).

---

## 3. Directory Layout & Architecture Map

Agents should maintain and organize code according to the following layout:

```
roundtrip/
├── .github/
│   ├── workflows/
│   │   └── roundtrip.yml            # Unified peer workflow: cron, manual & relay
├── docs/                            # Architectural and technical documentation
│   ├── ARCHITECTURE.md              # System design, ring lifecycle & failure modes
│   ├── STATION_CONFIG.md            # Configuration, sync safety & station roles
│   ├── PROTOCOL.md                  # Dispatch schemas & GitHub App authentication
│   ├── DATABASE_SCHEMA.md           # Local telemetry schema & run reconstruction
│   ├── CRON_SCHEDULER.md            # Cron jitter calculation & dynamic day election
│   └── FRONTEND_GANTT.md            # Vite + React dashboard & Gantt visualizer
├── scripts/                         # Python / Node / Bash automation scripts
│   ├── trigger_next.py              # GitHub App auth & repository_dispatch caller
│   ├── reconstruct_round.py         # Previous round trace & loop validator
│   ├── calculate_schedule.py        # Random day (1-30) generator & cron updater
│   └── record_metrics.py            # Local database recorder & analyzer
├── data/                            # Persistent benchmark records (or orphan branch)
│   └── runs.json                    # Historical run records & loop traces
├── src/                             # Vite + React + TypeScript frontend
│   ├── components/                  # Gantt chart, Station status, Ring topology
│   ├── data/                        # Types & data loaders
│   └── App.tsx                      # Dashboard root
├── AGENTS.md                        # This agent guide
├── config.template.json             # Station config template
└── package.json                     # Frontend dependencies & build scripts
```

---

## 4. Key Documentation References

Before implementing code changes, consult the relevant design specifications:
- [System Architecture & Lifecycle](file:///home/mk/AI-Agents/antigravity/roundtrip/docs/ARCHITECTURE.md)
- [Station Configuration & Fork Syncing](file:///home/mk/AI-Agents/antigravity/roundtrip/docs/STATION_CONFIG.md)
- [Dispatch Protocol & GitHub App Authentication](file:///home/mk/AI-Agents/antigravity/roundtrip/docs/PROTOCOL.md)
- [Database Schema & Round Reconstruction](file:///home/mk/AI-Agents/antigravity/roundtrip/docs/DATABASE_SCHEMA.md)
- [Cron Scheduler & Dynamic Rescheduling](file:///home/mk/AI-Agents/antigravity/roundtrip/docs/CRON_SCHEDULER.md)
- [Frontend Gantt & Pages Deployment](file:///home/mk/AI-Agents/antigravity/roundtrip/docs/FRONTEND_GANTT.md)

---

## 5. Development & Testing Conventions

When building or updating scripts and components:
1. **GitHub Action Mocking**: Test scripts locally using mock payloads (`tests/fixtures/`) without relying on live GitHub API calls.
2. **Deterministic Time Handling**: Always use ISO 8601 UTC timestamps (`YYYY-MM-DDTHH:MM:SS.sssZ`) across all telemetry, logs, and frontend displays.
3. **Resilience & Defensive Coding**: Network requests to upstream/downstream stations must implement timeouts and retries, and gracefully record broken loops without failing the workflow silently.
4. **Git Hygiene**: Verify author details match the repository owner prior to committing changes.
