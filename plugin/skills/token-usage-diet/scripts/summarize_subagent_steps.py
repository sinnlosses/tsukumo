#!/usr/bin/env python3
"""委譲先（subagent）の歩を種類ごとに数えて、どの歩が文脈を太らせているかを出す。

読むのは Claude Code の transcript（~/.claude/projects/<プロジェクト>/<セッション>/subagents/agent-*.jsonl）だけ。
**どこにも書かず、どこへも送らず、transcript を別の場所へ複製しない。**
歩の種類はツールの名前と引数のパスの形、Bash の先頭の語だけで決め、
依頼文・応答・ツールの結果の中身は読み取らず、出力にも出さない（出すのは数だけ）。

使い方:
    python3 summarize_subagent_steps.py                      # 直近7日
    python3 summarize_subagent_steps.py --days 14
    python3 summarize_subagent_steps.py --since 2026-09-28 --until 2026-10-04
    python3 summarize_subagent_steps.py --json
"""

from __future__ import annotations

import argparse
import json
import math
import re
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path

SOURCE_EXTENSIONS = frozenset(
    {".ts", ".tsx", ".js", ".mjs", ".cjs", ".jsx", ".py", ".css", ".html", ".json", ".sh", ".toml", ".yml", ".yaml"}
)
EXPLORE_COMMANDS = frozenset(
    {"ls", "find", "grep", "rg", "cat", "sed", "head", "tail", "wc", "tree", "stat", "file", "awk", "sort", "echo", "pwd", "which", "test", "diff"}
)
EDIT_TOOLS = frozenset({"Edit", "Write", "NotebookEdit"})
EXPLORE_TOOLS = frozenset({"Grep", "Glob"})
BASH_VERIFY_PATTERN = re.compile(r"\btw\s+verify\b|\bpnpm\b|\bvitest\b|\bplaywright\b")
BASH_LEADING_CD_PATTERN = re.compile(r"^\s*cd\s+\S+\s*&&\s*")
BASH_GIT_PATTERN = re.compile(r"(^|[;&|]\s*)git\b")

KIND_ORDER = (
    "Read: docs/",
    "Read: ソース",
    "Read: その他",
    "Bash: 検証",
    "Bash: git",
    "Bash: tw",
    "Bash: 探索",
    "Bash: その他",
    "Grep・Glob",
    "Edit・Write",
    "その他のツール",
    "考えるだけ",
)


@dataclass(frozen=True)
class Step:
    context: int
    cache_read: int
    result_bytes: int
    kind: str


def main() -> int:
    args = parse_args()
    since, until = resolve_period(args)
    files = find_transcripts(resolve_projects_dir(args.projects_dir), args.project)
    runs = [steps for path in files if (steps := read_steps(path, since, until))]
    report = build_report(since, until, len(files), runs)
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print(render(report))
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="委譲先の歩を種類ごとに数える")
    parser.add_argument("--days", type=int, default=7, help="直近の日数（既定 7）")
    parser.add_argument("--since", help="開始日 YYYY-MM-DD（--days より優先）")
    parser.add_argument("--until", help="終了日 YYYY-MM-DD（既定は今日）")
    parser.add_argument("--projects-dir", help="transcript の置き場（既定 ~/.claude/projects）")
    parser.add_argument("--project", default="tsukumo", help="プロジェクトのディレクトリ名に含む語（既定 tsukumo）")
    parser.add_argument("--json", action="store_true", help="集計を JSON で出す")
    return parser.parse_args()


def resolve_period(args: argparse.Namespace) -> tuple[date, date]:
    until = date.fromisoformat(args.until) if args.until else date.today()
    if args.since:
        return date.fromisoformat(args.since), until
    return until - timedelta(days=max(args.days, 1) - 1), until


def resolve_projects_dir(explicit: str | None) -> Path:
    return Path(explicit).expanduser() if explicit else Path.home() / ".claude" / "projects"


def find_transcripts(projects_dir: Path, keyword: str) -> list[Path]:
    if not projects_dir.is_dir():
        return []
    return sorted(
        path
        for project in projects_dir.iterdir()
        if project.is_dir() and keyword in project.name
        for path in project.glob("*/subagents/agent-*.jsonl")
    )


def read_steps(path: Path, since: date, until: date) -> list[Step]:
    """1本の transcript から、期間内の歩を時系列で返す。歩は assistant メッセージの id で束ねる。"""
    usages: dict[str, dict] = {}
    names: dict[str, list[tuple[str, str]]] = defaultdict(list)
    result_bytes: dict[str, int] = defaultdict(int)
    owner: dict[str, str] = {}
    order: list[str] = []
    in_period: set[str] = set()
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return []
    for line in lines:
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue
        message = entry.get("message")
        if not isinstance(message, dict):
            continue
        content = message.get("content")
        if entry.get("type") == "assistant" and isinstance(message.get("usage"), dict):
            step_id = message.get("id") or entry.get("uuid")
            if not isinstance(step_id, str):
                continue
            if step_id not in usages:
                order.append(step_id)
            usages[step_id] = message["usage"]
            day = local_day(entry.get("timestamp"))
            if day is not None and since <= day <= until:
                in_period.add(step_id)
            for block in content if isinstance(content, list) else []:
                if isinstance(block, dict) and block.get("type") == "tool_use":
                    names[step_id].append((str(block.get("name")), classify_input(block)))
                    owner[str(block.get("id"))] = step_id
        elif entry.get("type") == "user" and isinstance(content, list):
            for block in content:
                if isinstance(block, dict) and block.get("type") == "tool_result":
                    target = owner.get(str(block.get("tool_use_id")))
                    if target is not None:
                        result_bytes[target] += len(json.dumps(block.get("content"), ensure_ascii=False).encode("utf-8"))
    return [
        Step(
            context=context_size(usages[step_id]),
            cache_read=int(usages[step_id].get("cache_read_input_tokens") or 0),
            result_bytes=result_bytes[step_id],
            kind=kind_of(names[step_id]),
        )
        for step_id in order
        if step_id in in_period
    ]


def local_day(timestamp: object) -> date | None:
    if not isinstance(timestamp, str):
        return None
    try:
        return datetime.fromisoformat(timestamp.replace("Z", "+00:00")).astimezone().date()
    except ValueError:
        return None


def context_size(usage: dict) -> int:
    return sum(
        int(usage.get(key) or 0) for key in ("input_tokens", "cache_read_input_tokens", "cache_creation_input_tokens")
    )


def classify_input(block: dict) -> str:
    """tool_use の引数から、種類を決める手がかりだけを取り出す（Read はパスの形、Bash は先頭の語の分類）。"""
    name = block.get("name")
    tool_input = block.get("input")
    if not isinstance(tool_input, dict):
        return ""
    if name == "Read":
        return classify_read_path(str(tool_input.get("file_path") or ""))
    if name == "Bash":
        return classify_bash(str(tool_input.get("command") or ""))
    return ""


def classify_read_path(file_path: str) -> str:
    if "/docs/" in file_path or file_path.startswith("docs/"):
        return "Read: docs/"
    if Path(file_path).suffix in SOURCE_EXTENSIONS:
        return "Read: ソース"
    return "Read: その他"


def classify_bash(command: str) -> str:
    if BASH_VERIFY_PATTERN.search(command):
        return "Bash: 検証"
    if BASH_GIT_PATTERN.search(command):
        return "Bash: git"
    words = BASH_LEADING_CD_PATTERN.sub("", command).split()
    if words and words[0] == "tw":
        return "Bash: tw"
    if words and words[0] in EXPLORE_COMMANDS:
        return "Bash: 探索"
    return "Bash: その他"


def kind_of(calls: list[tuple[str, str]]) -> str:
    """1歩に複数のツール呼び出しがあるときは先頭の呼び出しで決める。"""
    if not calls:
        return "考えるだけ"
    name, hint = calls[0]
    if hint:
        return hint
    if name in EDIT_TOOLS:
        return "Edit・Write"
    if name in EXPLORE_TOOLS:
        return "Grep・Glob"
    if name == "Read":
        return "Read: その他"
    if name == "Bash":
        return "Bash: その他"
    return "その他のツール"


def percentile(values: list[int], ratio: float) -> int:
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, math.ceil(len(ordered) * ratio) - 1)]


def build_report(since: date, until: date, file_count: int, runs: list[list[Step]]) -> dict:
    all_steps = [step for run in runs for step in run]
    total_read = sum(step.cache_read for step in all_steps)
    by_kind = {
        kind: [step for step in all_steps if step.kind == kind] for kind in KIND_ORDER
    }
    kinds = [
        {
            "kind": kind,
            "steps": len(steps),
            "cacheRead": sum(step.cache_read for step in steps),
            "cacheReadPct": round(100 * sum(step.cache_read for step in steps) / total_read, 1) if total_read else 0.0,
            "resultBytes": sum(step.result_bytes for step in steps),
            "meanContext": round(sum(step.context for step in steps) / len(steps)) if steps else 0,
        }
        for kind, steps in by_kind.items()
    ]
    counts = [len(run) for run in runs]
    firsts = [run[0].context for run in runs]
    lasts = [run[-1].context for run in runs]
    return {
        "period": {"since": since.isoformat(), "until": until.isoformat()},
        "transcriptFiles": file_count,
        "delegations": len(runs),
        "steps": len(all_steps),
        "cacheRead": total_read,
        "kinds": kinds,
        "stepsPerDelegation": (
            {
                "median": percentile(counts, 0.5),
                "p90": percentile(counts, 0.9),
                "max": max(counts),
            }
            if runs
            else None
        ),
        "contextGrowth": (
            {
                "firstMedian": percentile(firsts, 0.5),
                "lastMedian": percentile(lasts, 0.5),
                "firstMean": round(sum(firsts) / len(firsts)),
                "lastMean": round(sum(lasts) / len(lasts)),
            }
            if runs
            else None
        ),
    }


def render(report: dict) -> str:
    period = report["period"]
    lines = [
        f"委譲先の歩の内訳（{period['since']} 〜 {period['until']}）",
        f"transcript {report['transcriptFiles']} 本のうち期間内の歩があるもの（委譲）{report['delegations']} 回、"
        f"歩 {report['steps']:,}、キャッシュ読み {report['cacheRead']:,}",
        "",
        "1. 歩の種類ごと",
        "| 種類 | 歩数 | キャッシュ読み | 割合% | 結果のバイト数 | 歩あたりの文脈 |",
        "| --- | ---: | ---: | ---: | ---: | ---: |",
    ]
    lines += [
        f"| {row['kind']} | {row['steps']:,} | {row['cacheRead']:,} | {row['cacheReadPct']} | "
        f"{row['resultBytes']:,} | {row['meanContext']:,} |"
        for row in sorted(report["kinds"], key=lambda row: -row["cacheRead"])
    ]
    per = report["stepsPerDelegation"]
    growth = report["contextGrowth"]
    if per is not None and growth is not None:
        lines += [
            "",
            "2. 委譲1回あたりの歩数",
            f"中央値 {per['median']}、90パーセンタイル {per['p90']}、最大 {per['max']}",
            "",
            "3. 歩を重ねるごとの文脈の伸び（最初の歩 → 最後の歩）",
            f"中央値 {growth['firstMedian']:,} → {growth['lastMedian']:,}、平均 {growth['firstMean']:,} → {growth['lastMean']:,}",
        ]
    return "\n".join(lines)


if __name__ == "__main__":
    raise SystemExit(main())
