# Station Configuration & Sync Safety

## 1. The Fork Synchronization Challenge

When multiple users fork `kreier/roundtrip` to participate in the roundtrip ring, they need to regularly sync their forks with the upstream `main` branch to receive feature updates, bug fixes, and visual enhancements.

If station configuration (e.g. station identity, next hop address, initiator status) were committed directly to a tracked file like `config.json` on `main`, syncing from upstream would either:
1. Overwrite the fork's local configuration with upstream's configuration.
2. Produce git merge conflicts that block automated GitHub fork synchronization.

---

## 2. The Non-Conflicting Configuration Model

Roundtrip resolves this challenge using a **hierarchical, non-destructive configuration model**:

```
Configuration Resolution Order:
[1. GitHub Actions Repository Variables] (Highest Priority)
                     ↓ (fallback if not set)
[2. Untracked Local File: .roundtrip/config.json] (Ignored by Git)
                     ↓ (fallback if not set)
[3. Default Template: config.template.json] (Committed Defaults)
```

### Strategy 1: GitHub Repository Variables (Recommended for Production Forks)
GitHub Actions natively provides **Repository Variables** (under `Settings > Secrets and variables > Actions > Variables`). These variables persist across fork syncs and never touch git commits:

| Variable Name | Type | Example Value | Description |
|---|---|---|---|
| `STATION_ID` | String | `kreier-sg-01` | Unique human-readable name of this station. |
| `CRON_ENABLED` | Boolean (String) | `false` | Master switch for scheduled monthly cron runs (defaults to `false` on forks). |
| `NEXT_STATION_REPO` | String | `offspring26/roundtrip` | Target GitHub repository (`owner/repo`) for the next hop. |
| `EXPECTED_PREVIOUS_STATION` | String | `kreier-station-0` | Upstream station identifier expected to trigger this node. |

### Strategy 2: Untracked Local Configuration File (For Local Testing)
For local development and testing, configurations can be placed in `.roundtrip/config.json`.
- `config.template.json` is committed to the repository with placeholder values.
- `.roundtrip/` is registered in `.gitignore`.
- Upstream pulls never touch `.roundtrip/config.json`.

---

## 3. Configuration Template (`config.template.json`)

The canonical schema committed to the repository:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "station": {
    "id": "station-template",
    "name": "Station Template",
    "location": "UTC",
    "is_initiator": false
  },
  "routing": {
    "initiator_repo": "kreier/roundtrip",
    "expected_previous_station": "station-0",
    "next_station_repo": "target-user/roundtrip"
  },
  "telemetry": {
    "public_pages_url": "https://target-user.github.io/roundtrip/",
    "storage_path": "data/runs.json"
  }
}
```

---

## 4. Onboarding a New Station to the Ring

To add a new station to the roundtrip network:

### Step 1: Fork the Repository
1. Navigate to `https://github.com/kreier/roundtrip` and click **Fork**.
2. Keep the repository name as `roundtrip`.

### Step 2: Install the GitHub App
1. Install the official **Roundtrip Relay GitHub App** on the newly created fork.
2. Grant the app repository permissions for `Contents: Read and Write` and `Workflows/Actions: Read and Write`.

### Step 3: Configure Repository Secrets
In your fork repository (`Settings > Secrets and variables > Actions > Secrets`):
- `ROUNDTRIP_APP_ID`: The App ID provided by the network coordinator.
- `ROUNDTRIP_APP_PRIVATE_KEY`: The RSA private key for the GitHub App.

### Step 4: Configure Repository Variables
In your fork repository (`Settings > Secrets and variables > Actions > Variables`):
- Set `STATION_ID`: e.g. `yourname-station`.
- Set `IS_INITIATOR`: `false`.
- Set `NEXT_STATION_REPO`: The repository of the station following you in the ring.
- Set `EXPECTED_PREVIOUS_STATION`: The station ID that triggers you.

### Step 5: Enable GitHub Pages
1. Go to `Settings > Pages`.
2. Under **Build and deployment > Source**, select **GitHub Actions**.

### Step 6: Inform Network Coordinator
The preceding station updates its `NEXT_STATION_REPO` variable to point to your fork repository.

---

## 5. Telemetry Persistence & Sync Safety (`telemetry` vs `telemetry-origin`)

To ensure that fork owners can freely click GitHub's **"Sync fork"** button without encountering merge conflicts or telemetry data loss:
- Application source code and workflows reside on `main`.
- Upstream origin (`kreier/roundtrip`) commits its own telemetry to **`telemetry-origin`**.
- Station forks automatically commit their telemetry to **`telemetry`**.
- Because the origin repository does not have a branch named `telemetry`, GitHub's fork UI treats each fork's `telemetry` branch as a **standalone, untracked branch**. It will never display *"commits ahead/behind"* banners or prompt fork maintainers to discard or sync commits on `telemetry`.
- On every workflow run, the runner restores the station's latest `data/runs.json` from its respective telemetry branch (`telemetry` for forks, `telemetry-origin` for origin), records the latest hop metrics, deploys to GitHub Pages, and pushes the updated database back to the dedicated branch.

### Managing and Cleaning Test Runs

Station owners can manage their benchmark history either directly in the web UI or via the terminal:

#### 1. In the Web UI:
- **Hide Test Runs**: Click the `🧪 Hide Test Runs` toggle to filter out `RT-TEST-*` runs.
- **Hide Specific Runs**: Click the `✕` button on any run in the selector to hide it from your dashboard.
- **Download Clean Database**: Click `💾 Download runs.json` to export a clean database with unwanted runs removed.
- **Restore Runs**: Click `Restore Hidden Runs` anytime to revert filters.

#### 2. Via CLI (`scripts/manage_runs.py`):
```bash
# List all recorded runs
python3 scripts/manage_runs.py --list

# Delete a specific test run
python3 scripts/manage_runs.py --delete RT-2026-10-05-314

# Clean all test runs containing 'TEST'
python3 scripts/manage_runs.py --clean-tests

# Commit and push changes directly to your telemetry branch
python3 scripts/manage_runs.py --push-telemetry
```
