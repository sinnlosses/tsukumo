"""メモリファイル（CLAUDE.md・AGENTS.md など）の束ねと、それを外したときの見積もり。

共通の部品は summarize_definition から取る。summarize_usage を取り込むと循環になる。
"""

from __future__ import annotations

from pathlib import Path

from summarize_definition import definition_item, definition_reads, top_items


def memory_estimates(
    by_session: dict[str, list[dict]], contexts: dict, coverage_info: dict, trim: float
) -> list[dict]:
    """メモリファイルを trim 割削ったら。作業ツリーごとの CLAUDE.md は1セッションに1つしか
    載らないので、Project のものはファイル名で束ねる。束ねはセッションの開始日ごとに分け、
    改名の前後が同じ行に混ざらないようにする（対象はファイル名と開始日になる）。"""
    days = {sid: session_day(by_session[sid]) for sid in contexts if sid in by_session}
    groups: set[tuple[str, str]] = set()
    for sid, day in days.items():
        for item in contexts[sid].get("memoryFiles", []) or []:
            if isinstance(item, dict):
                groups.add((memory_group(item), day))
    items = []
    for group, day in sorted(groups):
        scoped = {sid: usage for sid, usage in contexts.items() if days.get(sid) == day}

        def tokens_of(usage: dict, group: str = group) -> float:
            return sum(
                int(i.get("tokens", 0) or 0)
                for i in usage.get("memoryFiles", []) or []
                if isinstance(i, dict) and memory_group(i) == group
            )

        item = definition_item(
            "memory-file",
            f"{group}（{day} 開始）",
            definition_reads(by_session, scoped, tokens_of),
            coverage_info,
            trim,
            "high",
            "estimate",
            f"ファイルの大きさ × main のステップ数 × 削れる割合 {trim}",
            {"memoryTrim": trim},
        )
        if item:
            items.append(item)
    return top_items(items)


def memory_group(item: dict) -> str:
    name = str(item.get("name", "unknown"))
    if str(item.get("source", "")) == "Project":
        return Path(name).name
    return name


def session_day(timeline: list[dict]) -> str:
    """セッションの開始日。最初のターンの at の先頭10字（記録の現地の日付）。"""
    return timeline[0]["at"][:10]
