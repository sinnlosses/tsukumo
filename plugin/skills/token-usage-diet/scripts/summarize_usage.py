#!/usr/bin/env python3
"""tsukumo の使用量の記録を集計して、削減の候補になる数だけを出す。

読むのは $TSUKUMO_HOME（既定 ~/.tsukumo）の token-usage/ と context-usage/ だけ。
**どこにも書かず、どこへも送らず、記録を別の場所へ複製しない。**
生の JSONL をモデルの文脈へ流し込まないために、ここで畳んだ表だけを標準出力に出す。

使い方:
    python3 summarize_usage.py                      # 直近7日
    python3 summarize_usage.py --days 14
    python3 summarize_usage.py --since 2026-09-01 --until 2026-09-07
    python3 summarize_usage.py --json               # 同じ集計を JSON で（見積もりは estimates 節）
    python3 summarize_usage.py --result-trim 0.3    # 見積もりの仮定を変える（estimates-format.md「見積もりの節（`estimates`）の形」）

入口と組み立てだけを持つ。読み込みは summarize_records、集計は summarize_aggregate、
見積もりは summarize_estimates、表の整形は summarize_render。
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from summarize_aggregate import context, coverage, scopes, tools, totals, unused_mcp_tools
from summarize_estimates import (
    DEFAULT_MEMORY_TRIM,
    DEFAULT_RESULT_TRIM,
    DEFAULT_SESSION_THRESHOLD,
    estimates,
)
from summarize_records import read_session_records, read_turn_records, resolve_days, resolve_home
from summarize_render import render


def main() -> int:
    args = parse_args()
    home = resolve_home(args.home)
    days = resolve_days(args)
    turns = read_turn_records(home, days)
    sessions = read_session_records(home, days)
    assumptions = {
        "resultTrim": clamp_ratio(args.result_trim),
        "memoryTrim": clamp_ratio(args.memory_trim),
        "sessionThreshold": max(args.session_threshold, 1),
    }
    report = build_report(home, days, turns, sessions, top=args.top, assumptions=assumptions)
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print(render(report, top=args.top))
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="tsukumo の使用量の記録を集計する")
    parser.add_argument("--days", type=int, default=7, help="直近の日数（既定 7）")
    parser.add_argument("--since", help="開始日 YYYY-MM-DD（--days より優先）")
    parser.add_argument("--until", help="終了日 YYYY-MM-DD（既定は今日）")
    parser.add_argument("--home", help="記録の置き場（既定 $TSUKUMO_HOME か ~/.tsukumo）")
    parser.add_argument("--top", type=int, default=10, help="各一覧に出す件数（既定 10）")
    parser.add_argument("--json", action="store_true", help="集計を JSON で出す")
    parser.add_argument(
        "--result-trim",
        type=float,
        default=DEFAULT_RESULT_TRIM,
        help=f"見積もりの仮定: ツールの結果を何割絞れるか（既定 {DEFAULT_RESULT_TRIM}）",
    )
    parser.add_argument(
        "--memory-trim",
        type=float,
        default=DEFAULT_MEMORY_TRIM,
        help=f"見積もりの仮定: メモリファイルを何割削れるか（既定 {DEFAULT_MEMORY_TRIM}）",
    )
    parser.add_argument(
        "--session-threshold",
        type=int,
        default=DEFAULT_SESSION_THRESHOLD,
        help=f"見積もりの仮定: セッションを区切るコンテキストの大きさ（既定 {DEFAULT_SESSION_THRESHOLD}）",
    )
    return parser.parse_args()


def build_report(
    home: Path, days: list[str], turns: dict, sessions: dict, top: int, assumptions: dict
) -> dict:
    unused = unused_mcp_tools(turns["records"], sessions["sessions"])
    return {
        "range": {
            "since": days[0],
            "until": days[-1],
            "requested_days": len(days),
            "home": str(home),
        },
        "coverage": coverage(turns, sessions),
        "totals": totals(turns["records"]),
        "scopes": scopes(turns["records"]),
        "tools": tools(turns["records"]),
        "context": context(sessions["sessions"]),
        "unused_mcp_tools": unused,
        "estimates": estimates(turns["records"], sessions["sessions"], unused, assumptions, top),
    }


def clamp_ratio(value: float) -> float:
    return min(max(value, 0.0), 1.0)


if __name__ == "__main__":
    raise SystemExit(main())
