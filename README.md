# roundtrip

> A distributed, multi-account GitHub Actions benchmark and visualizer tracking execution time, scheduling jitter, and workflow propagation across a ring of repositories.

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

---

## Overview

**Roundtrip** explores the performance, reliability, and propagation latency of GitHub Actions across independent user accounts and repositories arranged in a ring topology:

1. **Monthly Initiation**: An elected Initiator station kicks off the roundtrip once per calendar month at **03:14 AM UTC** on a randomly selected day ($1 \le D \le 30$).
2. **Scheduler Jitter Measurement**: The initiator precisely measures runner queue latency and scheduler jitter against the theoretical 03:14 UTC mark.
3. **Sequential Relay**: Each station records local execution telemetry, builds and deploys an interactive Vite + React visualization to GitHub Pages, and triggers the next station in the sequence via a **GitHub App**.
4. **Prior Cycle Reconstruction**: Before triggering the next hop, each station audits and reconstructs the previous month's round by querying downstream and upstream endpoints back to Station 0.
5. **Dynamic Rescheduling**: When the signal returns to Station 0, the cycle is sealed, and a new random day is chosen and committed for the following month.

---

## Documentation

- **[AGENTS.md](AGENTS.md)** — Core guidelines, invariants, and operational instructions for AI coding agents and human contributors.
- **[System Architecture](docs/ARCHITECTURE.md)** — Ring topology, state machine lifecycle, failure recovery, and GitHub App security model.
- **[Station Configuration & Fork Sync Safety](docs/STATION_CONFIG.md)** — How forks maintain custom station routing without merge conflicts when syncing with upstream `main`.
- **[Dispatch Protocol](docs/PROTOCOL.md)** — `repository_dispatch` webhook payload schemas, token exchange, and validation rules.
- **[Database Schema & Reconstruction](docs/DATABASE_SCHEMA.md)** — Telemetry data schema in `data/runs.json` and the loop reconstruction algorithm.
- **[Cron Scheduler](docs/CRON_SCHEDULER.md)** — Details on the 3:14 AM UTC cron timing, jitter calculation, and dynamic day election.
- **[GitHub App Setup Guide](docs/GITHUB_APP_SETUP.md)** — Registering, configuring, and installing the Roundtrip Relay GitHub App across stations.
- **[Frontend Dashboard & Gantt Chart](docs/FRONTEND_GANTT.md)** — Specification for the Vite + React interactive Gantt visualization deployed to GitHub Pages.

---

## Quick Reference

### Station Roles
- **Peer Ring Nodes**: Any station can initiate a benchmark run on-demand (`MANUAL` or `TEST`), and stations with `CRON_ENABLED=true` run automated scheduled cycles.
- **Loop Sealing**: Whichever station initiated a given cycle seals the metrics and closes the loop when the return signal arrives.

### Authentication
Inter-station triggering uses a shared **GitHub App** installed on each station's repository, generating short-lived installation access tokens without personal access tokens (PATs).

---

## How to Set Up a Relay Station Fork

To connect your fork to the roundtrip ring, follow these 6 steps:

### 1. Fork the Repository
Click **Fork** at the top right of [`kreier/roundtrip`](https://github.com/kreier/roundtrip) to create a copy under your GitHub account.

### 2. Enable GitHub Actions
GitHub disables workflows on newly created forks by default:
1. Navigate to the **Actions** tab on your fork.
2. Click the green button: **"I understand my workflows, go ahead and enable them"**.

### 3. Enable GitHub Pages Deployment
1. Go to your fork's **Settings > Pages**.
2. Under **Build and deployment > Source**, select **GitHub Actions**.

### 4. Install the Roundtrip GitHub App
1. Open the GitHub App installation link:
   ```
   https://github.com/apps/roundtrip-relay/installations/new
   ```
2. Select your account and choose your `roundtrip` repository.
3. Click **Install**.

### 5. Add Repository Secrets
In your fork, navigate to **Settings > Secrets and variables > Actions > Secrets**:
- Add `ROUNDTRIP_APP_ID`: The numeric App ID (provided by the ring coordinator).
- Add `ROUNDTRIP_APP_PRIVATE_KEY`: The RSA private key `.pem` contents (provided by the ring coordinator).

### 6. Add Repository Variables
In your fork, navigate to **Settings > Secrets and variables > Actions > Variables**:
- `STATION_ID`: Your unique station name (e.g. `station-yourname`).
- `NEXT_STATION_REPO`: The repository of the next station in the ring (e.g. `anotheruser/roundtrip` or `kreier/roundtrip` to close the loop).
- `EXPECTED_PREVIOUS_STATION` *(optional)*: The station ID of the upstream station triggering you.

> [!TIP]
> **Zero Merge Conflicts**: By storing your routing information in GitHub Actions **Variables** rather than tracked files, you can freely use GitHub's **"Sync fork"** button to pull upstream updates from `kreier/roundtrip:main` without ever overwriting your station configuration or causing git merge conflicts.
> For more details, see [docs/STATION_CONFIG.md](docs/STATION_CONFIG.md) and [docs/GITHUB_APP_SETUP.md](docs/GITHUB_APP_SETUP.md).
