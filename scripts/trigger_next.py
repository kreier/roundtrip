#!/usr/bin/env python3
"""
scripts/trigger_next.py
Authenticates using a GitHub App (App ID + Private Key), obtains an installation
access token for the downstream target repository, and fires a repository_dispatch
event ('roundtrip_signal') with the accumulated telemetry payload.
"""

import argparse
import datetime
import json
import os
import sys
import time
import urllib.error
import urllib.request


def generate_app_jwt(app_id: str, private_key_pem: str) -> str:
    """Generates an RS256 signed JWT valid for 10 minutes for GitHub App authentication."""
    # Attempt using PyJWT first
    try:
        import jwt

        now = int(time.time())
        payload = {
            "iat": now - 60,  # 60s in the past to compensate for clock drift
            "exp": now + (10 * 60),  # 10 minutes max
            "iss": app_id,
        }
        return jwt.encode(payload, private_key_pem, algorithm="RS256")
    except ImportError:
        pass

    # Fallback to OpenSSL CLI if PyJWT is not installed
    import subprocess
    import tempfile
    import base64

    now = int(time.time())
    header = {"alg": "RS256", "typ": "JWT"}
    claims = {"iat": now - 60, "exp": now + 600, "iss": app_id}

    def b64url(data: bytes) -> str:
        return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")

    h_b64 = b64url(json.dumps(header).encode("utf-8"))
    c_b64 = b64url(json.dumps(claims).encode("utf-8"))
    signing_input = f"{h_b64}.{c_b64}".encode("utf-8")

    with tempfile.NamedTemporaryFile("w+", delete=False) as key_file:
        key_file.write(private_key_pem)
        key_path = key_file.name

    try:
        proc = subprocess.Popen(
            ["openssl", "dgst", "-sha256", "-sign", key_path],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        sig, err = proc.communicate(input=signing_input)
        if proc.returncode != 0:
            raise RuntimeError(f"OpenSSL signing error: {err.decode('utf-8')}")
        sig_b64 = b64url(sig)
        return f"{h_b64}.{c_b64}.{sig_b64}"
    finally:
        if os.path.exists(key_path):
            os.remove(key_path)


def github_api_request(url: str, token: str, method: str = "GET", body: dict = None) -> dict:
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Roundtrip-Relay-Dispatcher/1.0",
    }
    data = json.dumps(body).encode("utf-8") if body else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            content = resp.read().decode("utf-8")
            return json.loads(content) if content else {}
    except urllib.error.HTTPError as e:
        error_msg = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"GitHub API {method} {url} failed ({e.code}): {error_msg}")


def get_installation_token(app_id: str, private_key_pem: str, target_repo: str) -> str:
    """Fetches a scoped installation access token for the target repository."""
    jwt_token = generate_app_jwt(app_id, private_key_pem)

    # 1. Look up installation ID for target repository
    owner, repo = target_repo.split("/", 1)
    install_url = f"https://api.github.com/repos/{owner}/{repo}/installation"
    installation_data = github_api_request(install_url, jwt_token)
    installation_id = installation_data.get("id")

    if not installation_id:
        raise ValueError(f"Could not find GitHub App installation on repository '{target_repo}'. Has the app been installed there?")

    # 2. Request installation access token
    token_url = f"https://api.github.com/app/installations/{installation_id}/access_tokens"
    token_data = github_api_request(token_url, jwt_token, method="POST")
    return token_data.get("token")


def dispatch_next_station(
    app_id: str,
    private_key_pem: str,
    target_repo: str,
    payload: dict,
    dry_run: bool = False,
) -> bool:
    print(f"Preparing dispatch to next station: {target_repo}")

    if dry_run:
        print("[DRY-RUN] Validating JWT generation...")
        if app_id and private_key_pem:
            jwt_token = generate_app_jwt(app_id, private_key_pem)
            print(f"[DRY-RUN] Generated JWT successfully (len={len(jwt_token)}).")
        print(f"[DRY-RUN] Target: {target_repo}")
        print(f"[DRY-RUN] Client Payload:\n{json.dumps(payload, indent=2)}")
        return True

    if not app_id or not private_key_pem:
        raise ValueError("Missing ROUNDTRIP_APP_ID or ROUNDTRIP_APP_PRIVATE_KEY")

    token = get_installation_token(app_id, private_key_pem, target_repo)
    print(f"Obtained installation token for {target_repo}. Sending repository_dispatch...")

    owner, repo = target_repo.split("/", 1)
    dispatch_url = f"https://api.github.com/repos/{owner}/{repo}/dispatches"

    body = {
        "event_type": "roundtrip_signal",
        "client_payload": payload,
    }

    github_api_request(dispatch_url, token, method="POST", body=body)
    print(f"Successfully dispatched roundtrip_signal to {target_repo}!")
    return True


def main():
    parser = argparse.ArgumentParser(description="Trigger next station in the roundtrip ring via GitHub App")
    parser.add_argument("--target-repo", default=os.getenv("NEXT_STATION_REPO"))
    parser.add_argument("--round-id", required=True)
    parser.add_argument("--sequence", type=int, default=1)
    parser.add_argument("--station-id", default=os.getenv("STATION_ID", "station-0"))
    parser.add_argument("--current-repo", default=os.getenv("GITHUB_REPOSITORY", "kreier/roundtrip"))
    parser.add_argument("--payload-file", help="Path to base payload file to append to")
    parser.add_argument("--max-hops", type=int, default=int(os.getenv("MAX_HOPS", "12")), help="Maximum allowed hops")
    parser.add_argument("--dry-run", action="store_true", help="Simulate without firing live API calls")

    args = parser.parse_args()

    if args.sequence > args.max_hops:
        print(
            f"Safety limit reached: Hop sequence {args.sequence} exceeds maximum allowed hops ({args.max_hops}). "
            f"Halting propagation to prevent infinite runaway loops.",
            file=sys.stderr,
        )
        sys.exit(0)

    app_id = os.getenv("ROUNDTRIP_APP_ID")
    private_key = os.getenv("ROUNDTRIP_APP_PRIVATE_KEY")

    if not args.target_repo:
        print("Error: Target repository not specified. Set NEXT_STATION_REPO or pass --target-repo", file=sys.stderr)
        sys.exit(1)

    now_iso = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"

    # Assemble client payload
    payload = {
        "round_id": args.round_id,
        "hop": {
            "sequence": args.sequence,
            "dispatched_by_station": args.station_id,
            "dispatched_by_repo": args.current_repo,
            "dispatched_at_utc": now_iso,
            "target_station_repo": args.target_repo,
        },
        "trace": [],
    }

    initiator_info = {}
    if args.payload_file and os.path.exists(args.payload_file):
        try:
            with open(args.payload_file, "r", encoding="utf-8") as f:
                prev_payload = json.load(f)
                initiator_info = prev_payload.get("initiator", {})
                payload["trace"] = prev_payload.get("trace", [])
        except Exception as e:
            print(f"Warning: Failed to read incoming payload file: {e}", file=sys.stderr)

    if not initiator_info:
        runs_path = os.path.join(os.getcwd(), "data", "runs.json")
        if os.path.exists(runs_path):
            try:
                with open(runs_path, "r", encoding="utf-8") as f:
                    runs_db = json.load(f)
                    for r in runs_db.get("runs", []):
                        if r.get("round_id") == args.round_id and r.get("initiator"):
                            initiator_info = r.get("initiator")
                            break
            except Exception as e:
                pass

    if not initiator_info:
        initiator_info = {
            "station_id": args.station_id,
            "repo": args.current_repo,
            "scheduled_time_utc": now_iso,
            "actual_start_utc": now_iso,
            "cron_jitter_ms": 0,
        }

    if "trigger_type" not in initiator_info:
        rid = (args.round_id or "").upper()
        if "TEST" in rid:
            initiator_info["trigger_type"] = "TEST"
        elif "MANUAL" in rid:
            initiator_info["trigger_type"] = "MANUAL"
        else:
            initiator_info["trigger_type"] = "CRON"

    payload["initiator"] = initiator_info

    # Append current station's hop record to trace
    payload["trace"].append({
        "station_id": args.station_id,
        "repo": args.current_repo,
        "sequence": args.sequence - 1,
        "dispatched_next_at_utc": now_iso,
    })

    try:
        dispatch_next_station(
            app_id=app_id,
            private_key_pem=private_key,
            target_repo=args.target_repo,
            payload=payload,
            dry_run=args.dry_run,
        )
    except Exception as e:
        print(f"Dispatch failed: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
