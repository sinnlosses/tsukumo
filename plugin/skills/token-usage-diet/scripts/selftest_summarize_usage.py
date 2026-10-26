#!/usr/bin/env python3
"""`summarize_usage.py` の自己テスト。

使い方: python3 selftest_summarize_usage.py

標準ライブラリだけで動く。落ちたら非0で終わる。
記録の中身は作らず、架空のセッションだけを使う。
"""

from __future__ import annotations

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import summarize_memory as sm  # noqa: E402

failures: list[str] = []


def check(label: str, cond: bool, detail: str = "") -> None:
    if cond:
        print(f"  ok   {label}")
    else:
        print(f"  FAIL {label}{(': ' + detail) if detail else ''}")
        failures.append(label)


def session(sid: str, day: str, memory_name: str) -> tuple[list[dict], dict]:
    """3ターン（各5ステップ）と、そのセッションの内訳（メモリ1件）を返す。"""
    turns = [
        {"sessionId": sid, "at": f"{day}T10:0{n}:00+09:00", "steps": 5, "cacheRead": 0, "tools": []}
        for n in range(3)
    ]
    usage = {
        "memoryFiles": [{"name": memory_name, "source": "Project", "tokens": 1000}],
        "skills": [],
        "mcpTools": [],
    }
    return turns, usage


def build(sessions: list[tuple[str, str, str]]) -> list[dict]:
    """(セッションの ID, 開始日, メモリのパス) から、memory_estimates の入力を組む。"""
    by_session: dict[str, list[dict]] = {}
    contexts: dict[str, dict] = {}
    for sid, day, memory_name in sessions:
        turns, usage = session(sid, day, memory_name)
        by_session[sid] = turns
        contexts[sid] = usage
    steps = sum(t["steps"] for turns in by_session.values() for t in turns)
    coverage = {"stepsTotal": steps, "stepsMatched": steps}
    return sm.memory_estimates(by_session, contexts, coverage, 0.3)


def test_rename_before_and_after_are_separate_rows() -> None:
    print("改名の前後（CLAUDE.md と AGENTS.md）が別の行に出る")
    rows = build(
        [
            ("s1", "2026-10-20", "/work/CLAUDE.md"),
            ("s2", "2026-10-21", "/work/CLAUDE.md"),
            ("s3", "2026-10-25", "/work/AGENTS.md"),
        ]
    )
    targets = sorted(row["target"] for row in rows)
    check(
        "行の数が 3（CLAUDE.md の2日と AGENTS.md の1日）",
        len(rows) == 3,
        f"{len(rows)} 行: {targets}",
    )
    check(
        "CLAUDE.md の行が開始日ごとに分かれる",
        "CLAUDE.md（2026-10-20 開始）" in targets and "CLAUDE.md（2026-10-21 開始）" in targets,
        f"{targets}",
    )
    check(
        "改名後の AGENTS.md は改名前の CLAUDE.md と別の行",
        "AGENTS.md（2026-10-25 開始）" in targets,
        f"{targets}",
    )


def test_same_name_same_day_merges() -> None:
    print("同じ名前・同じ開始日は1行にまとまる")
    rows = build(
        [
            ("s1", "2026-10-22", "/work/CLAUDE.md"),
            ("s2", "2026-10-22", "/work/CLAUDE.md"),
        ]
    )
    check("1行に束ねられる", len(rows) == 1, f"{len(rows)} 行")
    check(
        "その行は2セッション分を数える",
        len(rows) == 1 and rows[0]["basis"]["sessions"] == 2,
        f"{rows[0]['basis'] if rows else None}",
    )


def test_each_row_counts_only_its_own_day() -> None:
    print("行の基礎は開始日が同じセッションだけを数える")
    rows = build(
        [
            ("s1", "2026-10-20", "/work/CLAUDE.md"),
            ("s2", "2026-10-21", "/work/CLAUDE.md"),
            ("s3", "2026-10-22", "/work/CLAUDE.md"),
        ]
    )
    by_target = {row["target"]: row for row in rows}
    check(
        "各行の sessions は 1",
        len(by_target) == 3 and all(row["basis"]["sessions"] == 1 for row in rows),
        f"{[(r['target'], r['basis']['sessions']) for r in rows]}",
    )


if __name__ == "__main__":
    print("summarize_usage.py の自己テスト")
    test_rename_before_and_after_are_separate_rows()
    test_same_name_same_day_merges()
    test_each_row_counts_only_its_own_day()
    if failures:
        print(f"\n{len(failures)} 件失敗")
        sys.exit(1)
    print("\nすべて通った")
