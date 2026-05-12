"""Add inetgration/youssef to sys.path before any graphrag imports."""

from __future__ import annotations

import sys
from pathlib import Path


def graphrag_project_root() -> Path:
    """BridgingBipolar repo root (parent of rag_api/)."""
    return Path(__file__).resolve().parents[2]


def youssef_root() -> Path:
    return graphrag_project_root() / "inetgration" / "youssef"


def ensure_graphrag_path() -> Path:
    root = youssef_root()
    if not root.is_dir():
        raise RuntimeError(f"GraphRAG path not found: {root}")
    s = str(root.resolve())
    if s not in sys.path:
        sys.path.insert(0, s)
    return root
