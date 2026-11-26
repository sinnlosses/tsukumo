"""記録（token-usage/ と context-usage/）の置き場の解決と読み込み。

読むだけで、どこにも書かず、どこへも送らない。
"""

from __future__ import annotations

import argparse
import json
import os
from datetime import date, timedelta
from pathlib import Path


def resolve_home(explicit: str | None) -> Path:
    if explicit:
        return Path(explicit).expanduser()
    from_env = os.environ.get("TSUKUMO_HOME")
    if from_env:
        return Path(from_env).expanduser()
    return Path.home() / ".tsukumo"


def resolve_days(args: argparse.Namespace) -> list[str]:
    until = date.fromisoformat(args.until) if args.until else date.today()
    if args.since:
        since = date.fromisoformat(args.since)
    else:
        since = until - timedelta(days=max(args.days, 1) - 1)
    if since > until:
        since, until = until, since
    span = (until - since).days + 1
    return [(since + timedelta(days=i)).isoformat() for i in range(span)]


def is_fake(record: object) -> bool:
    return isinstance(record, dict) and record.get("sessionId") == "fake-session"


def read_turn_records(home: Path, days: list[str]) -> dict:
    """1行 = 1ターン。v=1 の行は breakdown を持たないので、合計だけ使える行として扱う。"""
    found_days: list[str] = []
    missing_days: list[str] = []
    records: list[dict] = []
    broken = 0
    for day in days:
        path = home / "token-usage" / f"{day}.jsonl"
        if not path.exists():
            missing_days.append(day)
            continue
        found_days.append(day)
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                broken += 1
                continue
            if not is_fake(record):
                records.append(record)
    return {
        "found_days": found_days,
        "missing_days": missing_days,
        "records": records,
        "broken_lines": broken,
    }


def read_session_records(home: Path, days: list[str]) -> dict:
    """1行 = 1セッション。同じ sessionId が複数行あるので、最後の行だけを採る。"""
    found_days: list[str] = []
    missing_days: list[str] = []
    by_session: dict[str, dict] = {}
    lines_read = 0
    broken = 0
    for day in days:
        path = home / "context-usage" / f"{day}.jsonl"
        if not path.exists():
            missing_days.append(day)
            continue
        found_days.append(day)
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                broken += 1
                continue
            if is_fake(record):
                continue
            lines_read += 1
            if isinstance(record.get("usage"), dict):
                by_session[str(record.get("sessionId"))] = record
    return {
        "found_days": found_days,
        "missing_days": missing_days,
        "lines": lines_read,
        "sessions": list(by_session.values()),
        "broken_lines": broken,
    }
