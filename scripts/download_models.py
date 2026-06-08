#!/usr/bin/env python3
"""Download trained model artifacts listed in models/manifest.json (ESPRIT compliance).

Usage:
  python scripts/download_models.py
  python scripts/download_models.py --train-keystroke
  python scripts/download_models.py --bundle phase-monitor-voice
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "models" / "manifest.json"
PLACEHOLDER_MARKERS = ("VOTRE_ORG", "YOUR_ORG", "PLACEHOLDER", "example.com")


def load_manifest() -> dict:
    if not MANIFEST.is_file():
        print(f"Missing manifest: {MANIFEST}", file=sys.stderr)
        sys.exit(1)
    return json.loads(MANIFEST.read_text(encoding="utf-8"))


def is_placeholder_url(url: str) -> bool:
    lower = url.lower()
    return not url.strip() or any(m.lower() in lower for m in PLACEHOLDER_MARKERS)


def download_file(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    rel = dest.relative_to(ROOT)
    req = urllib.request.Request(url, headers={"User-Agent": "BridgingBipolar-model-downloader/1.0"})
    with urllib.request.urlopen(req, timeout=300) as resp:
        total = int(resp.headers.get("Content-Length", 0))
        if total:
            print(f"  downloading {rel} ({total / (1024 * 1024):.1f} MB) ...", flush=True)
        else:
            print(f"  downloading {rel} ...", flush=True)
        chunk_size = 1024 * 256
        downloaded = 0
        with dest.open("wb") as out:
            while True:
                chunk = resp.read(chunk_size)
                if not chunk:
                    break
                out.write(chunk)
                downloaded += len(chunk)
                if total and downloaded % (chunk_size * 40) < chunk_size:
                    pct = downloaded * 100 // total
                    print(f"    {pct}% ({downloaded / (1024 * 1024):.1f} MB)", flush=True)
    size = dest.stat().st_size
    print(f"  OK  {rel} ({size:,} bytes)", flush=True)


def train_keystroke(manifest: dict) -> int:
    bundle = next((b for b in manifest.get("bundles", []) if b.get("id") == "keystroke-artifacts"), None)
    if not bundle or "train_local" not in bundle:
        print("No train_local config for keystroke in manifest.", file=sys.stderr)
        return 1
    cfg = bundle["train_local"]
    cwd = ROOT / cfg["cwd"]
    cmd = cfg["command"]
    print(f"Training keystroke models in {cwd} ...")
    result = subprocess.run(cmd, cwd=cwd, shell=True)
    return result.returncode


def download_bundle(manifest: dict, bundle: dict, force: bool) -> bool:
    base_url = manifest.get("base_url", "").rstrip("/")
    if is_placeholder_url(base_url):
        print(f"\n[!] base_url not configured in models/manifest.json")
        print("    Upload artifacts to Hugging Face Hub (or Google Drive) and set base_url.")
        print("    See models/README.md for instructions.\n")
        if bundle.get("train_local"):
            print(f"    Or run: python scripts/download_models.py --train-keystroke\n")
        return False

    target_root = ROOT / bundle["target_dir"]
    ok = True
    print(f"\n== {bundle['id']} -> {bundle['target_dir']}")

    for item in bundle.get("files", []):
        rel_name = item["name"]
        dest = target_root / rel_name
        if dest.is_file() and not force:
            print(f"  skip (exists) {dest.relative_to(ROOT)}")
            continue
        remote_path = item.get("remote_path") or rel_name.replace("\\", "/")
        url = item.get("url") or f"{base_url}/{remote_path}"
        try:
            download_file(url, dest)
        except urllib.error.HTTPError as exc:
            print(f"  FAIL {rel_name}: HTTP {exc.code} — {url}", file=sys.stderr)
            ok = False
        except Exception as exc:
            print(f"  FAIL {rel_name}: {exc}", file=sys.stderr)
            ok = False
    return ok


def main() -> int:
    parser = argparse.ArgumentParser(description="Download BridgingBipolar trained models")
    parser.add_argument("--bundle", help="Download only this bundle id")
    parser.add_argument("--force", action="store_true", help="Re-download even if file exists")
    parser.add_argument("--train-keystroke", action="store_true", help="Train keystroke joblib models locally")
    args = parser.parse_args()

    manifest = load_manifest()

    if args.train_keystroke:
        return train_keystroke(manifest)

    bundles = manifest.get("bundles", [])
    if args.bundle:
        bundles = [b for b in bundles if b.get("id") == args.bundle]
        if not bundles:
            print(f"Unknown bundle: {args.bundle}", file=sys.stderr)
            return 1

    print("BridgingBipolar — download trained models (not in Git)")
    print(f"Manifest: {MANIFEST.relative_to(ROOT)}")

    all_ok = True
    for bundle in bundles:
        if not download_bundle(manifest, bundle, args.force):
            all_ok = False

    if all_ok:
        print("\nDone. Runtime auto-download models (Ollama, Whisper, etc.) — see models/manifest.json")
        return 0

    print("\nSome downloads failed. Check models/README.md or use --train-keystroke for keystroke models.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
