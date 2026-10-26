"""定義（メモリ・スキル・MCP ツール）を外したときの見積もりの共通部品。

ここから summarize_usage を取り込むと循環になるので、取り込まない。
"""

from __future__ import annotations

# 根拠のターンがこれより少ない件は出さない（外れ値を恒常的な浪費と取り違えない）。
MIN_BASIS_TURNS = 3

# 1種類あたりに出す件数の上限（効きの大きい順）。
MAX_ITEMS_PER_KIND = 3


def definition_reads(
    by_session: dict[str, list[dict]], contexts: dict, tokens_of
) -> tuple[float, int, int]:
    """定義のトークン × main のステップ数を、内訳のあるセッションで足す。"""
    tokens = 0.0
    turn_count = 0
    session_count = 0
    for session_id, timeline in by_session.items():
        usage = contexts.get(session_id)
        if usage is None:
            continue
        per_step = tokens_of(usage)
        if per_step <= 0:
            continue
        session_count += 1
        for turn in timeline:
            if turn["steps"] == 0:
                continue
            turn_count += 1
            tokens += per_step * turn["steps"]
    return tokens, turn_count, session_count


def definition_item(
    kind: str,
    target: str,
    reads: tuple[float, int, int],
    coverage_info: dict,
    ratio: float,
    confidence: str,
    bound: str,
    note: str,
    assumptions: dict,
) -> dict | None:
    """内訳のあるセッションで数えたぶんを、main のステップ数の比で期間全体へ伸ばす。"""
    tokens, turn_count, session_count = reads
    if turn_count < MIN_BASIS_TURNS or tokens <= 0:
        return None
    scale = coverage_info["stepsTotal"] / coverage_info["stepsMatched"]
    if coverage_info["stepsMatched"] / coverage_info["stepsTotal"] < 0.5:
        confidence = lower_confidence(confidence)
    return {
        "kind": kind,
        "target": target,
        "estimatedTokens": round(tokens * ratio * scale),
        "confidence": confidence,
        "bound": bound,
        "basis": {
            "turns": turn_count,
            "sessions": session_count,
            "steps": coverage_info["stepsMatched"],
            "scaledToSteps": coverage_info["stepsTotal"],
        },
        "assumptions": assumptions,
        "note": note,
    }


def top_items(items: list[dict]) -> list[dict]:
    return sorted(items, key=lambda r: -r["estimatedTokens"])[:MAX_ITEMS_PER_KIND]


def lower_confidence(confidence: str) -> str:
    return {"high": "medium", "medium": "low"}.get(confidence, "low")
