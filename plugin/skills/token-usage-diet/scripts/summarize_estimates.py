"""提案ごとの見積もり（estimates 節）。測った数ではなく、実行していたら減っていた量の推定。"""

from __future__ import annotations

from summarize_aggregate import BYTES_PER_TOKEN, CONSUMED_TOKEN_KEYS
from summarize_definition import (
    MIN_BASIS_TURNS,
    definition_item,
    definition_reads,
    top_items,
)
from summarize_memory import memory_estimates

# 形を変えたら上げる。読む側（スキル・tsukumo の画面）はこの数で形の変わり目に気づく。
ESTIMATES_VERSION = 2

# 効きめの境目（期間のトークンの消費量に占める割合、%）。estimates-format.md「見積もりの節（`estimates`）の形」と揃える。
# 費用の割合だった v1 と同じ数のまま。上限に照らして較正したものではない。
IMPACT_LARGE_PCT = 3.0
IMPACT_MEDIUM_PCT = 0.5

# 仮定の値の既定（引数で変えられる。使った値は各件の assumptions に載る）。
DEFAULT_RESULT_TRIM = 0.5
DEFAULT_MEMORY_TRIM = 0.3
DEFAULT_SESSION_THRESHOLD = 200_000

# 1ステップあたりのキャッシュ読みが前のターンのこの割合を下回ったら、自動圧縮か作り直しが
# 挟まったとみなし、それより前のツールの結果は持ち越さない。
COMPACTION_DROP_RATIO = 0.5


def estimates(
    records: list[dict], sessions: list[dict], unused: dict, assumptions: dict, top: int
) -> dict:
    """提案ごとに「実行したら期間中に何トークン減っていたか」を見積もる。

    **測った数ではない。** 式の前提:
    - main の1ステップあたりのキャッシュ読みは、そのステップのコンテキストの大きさにほぼ等しい
      （セッションの内訳の使用量と突き合わせて中央値 0.99 倍。2026-09-24）。
      subagent はコンテキストの記録が無く確かめられないので、ステップに掛ける式には使わない
      （そのぶん見積もりは小さめに出る）
    - 定義（MCP・スキル・メモリ）の1トークンは main の1ステップごとに1回読み直される
    - トークンは種類（入力・キャッシュ読み・キャッシュ作成・出力）を重みなしで足す
      （CONSUMED_TOKEN_KEYS）。費用には換算しない
    """
    denominator = estimate_denominator(records)
    base = {
        "version": ESTIMATES_VERSION,
        "measured": False,
        "denominator": denominator,
        "thresholds": {"largePct": IMPACT_LARGE_PCT, "mediumPct": IMPACT_MEDIUM_PCT},
        "assumptions": assumptions,
    }
    turns = main_turns(records)
    if not turns or not denominator["value"]:
        reason = (
            "この期間のターンの記録が無い"
            if not records
            else "内訳（breakdown）の取れたターンが無い（v=1 の行だけ）"
            if not turns
            else "期間のトークンの消費量が0"
        )
        return base | {
            "mainReadSharePct": None,
            "caveats": [],
            "status": "unavailable",
            "reasons": [reason],
            "upperBoundSharePct": None,
            "items": [],
            "notEstimated": not_estimated([]),
        }
    by_session = session_timelines(turns)
    contexts = {str(r.get("sessionId")): r["usage"] for r in sessions}
    steps_total = sum(t["steps"] for t in turns)
    steps_matched = sum(t["steps"] for t in turns if t["sessionId"] in contexts)
    reasons: list[str] = []
    items: list[dict] = []
    if steps_matched == 0:
        reasons.append(
            "セッションの内訳（context-usage）と重なるターンが無いので、定義を外す見積もり"
            "（unused-mcp / memory-file / skill-definition）は出せない"
        )
    else:
        coverage_info = {"stepsMatched": steps_matched, "stepsTotal": steps_total}
        items += unused_mcp_estimates(by_session, contexts, unused, coverage_info)
        items += memory_estimates(by_session, contexts, coverage_info, assumptions["memoryTrim"])
        items += skill_estimates(by_session, contexts, coverage_info)
    items += tool_result_estimates(by_session, assumptions["resultTrim"])
    items += session_length_estimates(by_session, contexts, assumptions["sessionThreshold"])
    denominator_value = denominator["value"]
    finished = []
    for item in items:
        share = round(100 * item["estimatedTokens"] / denominator_value, 2)
        finished.append(
            item
            | {
                "key": f"{item['kind']}:{item['target'].strip()}",
                "sharePct": share,
                "impact": impact_of(share),
            }
        )
    finished.sort(key=lambda r: -r["sharePct"])
    positive = [r for r in finished if r["sharePct"] > 0]
    main_read = sum(t["cacheRead"] for t in turns)
    main_share = (
        round(100 * main_read / denominator["cacheReadTokens"], 1) if denominator["cacheReadTokens"] else None
    )
    return base | {
        "mainReadSharePct": main_share,
        "caveats": [
            "割合の分母は種類を重みなしで足したトークンの消費量。サブスクリプションの上限が種類ごとに"
            "どう数えられるかは公開されておらず確かめていないので、上限に占める割合とは言えない",
            f"式に入るのは main の読みだけ（キャッシュ読みの合計の {main_share}%）。subagent と、"
            "内訳に載らない読みは数えないので、見積もりは小さめに出る",
        ]
        + (
            [
                f"定義を外す見積もりは、内訳のあるセッションの main のステップ {steps_matched}/{steps_total} で"
                "数え、ステップ数の比で期間全体へ伸ばした"
            ]
            if 0 < steps_matched < steps_total
            else []
        ),
        "status": "ok" if positive else "unavailable",
        "reasons": reasons if positive else reasons + ["どの提案にも正の見積もりが出なかった"],
        "upperBoundSharePct": round(sum(r["sharePct"] for r in positive), 2) if positive else None,
        "items": positive,
        "notEstimated": not_estimated([r["kind"] for r in positive]),
    }


def estimate_denominator(records: list[dict]) -> dict:
    """割合の分母は期間のトークンの消費量（models の CONSUMED_TOKEN_KEYS を重みなしで足したもの）。"""
    by_type = {k: 0 for k in CONSUMED_TOKEN_KEYS}
    for record in records:
        for usage in record.get("models", []) or []:
            if isinstance(usage, dict):
                for key in CONSUMED_TOKEN_KEYS:
                    by_type[key] += int(usage.get(key, 0) or 0)
    total = sum(by_type.values())
    return {
        "kind": "consumedTokens",
        "value": total if total else None,
        "byType": by_type,
        "cacheReadTokens": by_type["cacheReadInputTokens"],
    }


def main_turns(records: list[dict]) -> list[dict]:
    """内訳のあるターンを main の数だけに畳む。"""
    out = []
    for record in records:
        breakdown = record.get("breakdown")
        if not isinstance(breakdown, dict):
            continue
        main_part = breakdown.get("main")
        if not isinstance(main_part, dict):
            continue
        tokens = main_part.get("tokens") if isinstance(main_part.get("tokens"), dict) else {}
        out.append(
            {
                "sessionId": str(record.get("sessionId")),
                "at": str(record.get("at", "")),
                "steps": int(main_part.get("steps", 0) or 0),
                "cacheRead": int(tokens.get("cacheReadInputTokens", 0) or 0),
                "tools": [
                    {
                        "name": str(t.get("name", "unknown")),
                        "calls": int(t.get("calls", 0) or 0),
                        "resultBytes": int(t.get("resultBytes", 0) or 0),
                    }
                    for t in main_part.get("tools", []) or []
                    if isinstance(t, dict)
                ],
            }
        )
    return out


def session_timelines(turns: list[dict]) -> dict[str, list[dict]]:
    """セッションごとに at の順に並べ、1ステップあたりのコンテキストを足す。"""
    by_session: dict[str, list[dict]] = {}
    for turn in turns:
        by_session.setdefault(turn["sessionId"], []).append(turn)
    for timeline in by_session.values():
        timeline.sort(key=lambda t: t["at"])
        for turn in timeline:
            turn["context"] = turn["cacheRead"] / turn["steps"] if turn["steps"] else 0.0
    return by_session


def unused_mcp_estimates(
    by_session: dict[str, list[dict]], contexts: dict, unused: dict, coverage_info: dict
) -> list[dict]:
    """未使用の MCP ツールをサーバごと外したら。deferred はコンテキストウィンドウの外なので、各セッションの
    MCP の分類の used / (used + deferred) の比で入っているぶんだけを数える
    （deferred の別は記録に無いので按分する）。"""
    unused_names = {r["name"]: r["server"] for r in unused.get("rows", [])}
    servers = sorted({s for s in unused_names.values()})
    items = []
    for server in servers:
        names = {n for n, s in unused_names.items() if s == server}

        def tokens_of(usage: dict, names: set[str] = names) -> float:
            unused_tokens = sum(
                int(t.get("tokens", 0) or 0)
                for t in usage.get("mcpTools", []) or []
                if isinstance(t, dict) and str(t.get("name")) in names
            )
            return unused_tokens * in_window_ratio(usage)

        item = definition_item(
            "unused-mcp",
            server,
            definition_reads(by_session, contexts, tokens_of),
            coverage_info,
            1.0,
            "medium",
            "estimate",
            f"期間中1度も呼ばれていない {len(names)} 件の定義 × main のステップ数"
            "（deferred のぶんは MCP の分類の比で按分して除いた）",
            {"removedShare": 1.0},
        )
        if item:
            items.append(item)
    return top_items(items)


def in_window_ratio(usage: dict) -> float:
    """MCP の分類（名前が "MCP tools" で始まるもの）のうち used の割合。判定は kind で行う。"""
    used = 0
    deferred = 0
    for category in usage.get("categories", []) or []:
        if not isinstance(category, dict) or not str(category.get("name", "")).startswith("MCP tools"):
            continue
        if category.get("kind") == "used":
            used += int(category.get("tokens", 0) or 0)
        elif category.get("kind") == "deferred":
            deferred += int(category.get("tokens", 0) or 0)
    return used / (used + deferred) if used + deferred else 1.0


def skill_estimates(by_session: dict[str, list[dict]], contexts: dict, coverage_info: dict) -> list[dict]:
    """スキルの定義を全部外したら（上限）。どれを外すかは記録から決められない。"""

    def tokens_of(usage: dict) -> float:
        return sum(
            int(i.get("tokens", 0) or 0) for i in usage.get("skills", []) or [] if isinstance(i, dict)
        )

    item = definition_item(
        "skill-definition",
        "",
        definition_reads(by_session, contexts, tokens_of),
        coverage_info,
        1.0,
        "high",
        "upper",
        "スキルの定義の合計 × main のステップ数。全部外した場合の上限で、どれを外すかは利用者が決める",
        {"removedShare": 1.0},
    )
    return [item] if item else []


def tool_result_estimates(by_session: dict[str, list[dict]], trim: float) -> list[dict]:
    """main のツールの結果を trim 割絞ったら。結果はそのターンの残り（ステップ数の半分と
    みなす）と、同じセッションのそのあとのターンの全ステップで読み直される。1ステップあたりの
    読みが急に落ちたターン（圧縮・作り直し）より先へは持ち越さない。記録に圧縮の時点は無いので
    大きめに出る。"""
    rows: dict[str, dict] = {}
    for session_id, timeline in by_session.items():
        carry = carry_steps(timeline)
        for index, turn in enumerate(timeline):
            steps = turn["steps"] / 2 + carry[index]
            for tool in turn["tools"]:
                if tool["resultBytes"] <= 0:
                    continue
                result_tokens = tool["resultBytes"] / BYTES_PER_TOKEN
                row = rows.setdefault(
                    tool["name"], {"tokens": 0.0, "turns": 0, "sessions": set(), "calls": 0}
                )
                row["tokens"] += result_tokens * steps
                row["turns"] += 1
                row["calls"] += tool["calls"]
                row["sessions"].add(session_id)
    items = []
    for name, row in rows.items():
        if row["turns"] < MIN_BASIS_TURNS:
            continue
        items.append(
            {
                "kind": "tool-result",
                "target": name,
                "estimatedTokens": round(row["tokens"] * trim),
                "confidence": "medium",
                "bound": "estimate",
                "basis": {"turns": row["turns"], "sessions": len(row["sessions"]), "calls": row["calls"]},
                "assumptions": {"resultTrim": trim, "bytesPerToken": BYTES_PER_TOKEN},
                "note": f"結果のトークン × そのあとに続く main のステップ数 × 絞れる割合 {trim}"
                "（subagent の結果は含めない）",
            }
        )
    return top_items(items)


def carry_steps(timeline: list[dict]) -> list[float]:
    """各ターンについて「そのあと同じセッションで続く main のステップ数」。圧縮とみなした
    ターンで打ち切る。"""
    out: list[float] = [0.0] * len(timeline)
    steps = 0.0
    for index in range(len(timeline) - 1, -1, -1):
        out[index] = steps
        turn = timeline[index]
        previous = timeline[index - 1] if index > 0 else None
        steps += turn["steps"]
        if previous and turn["context"] and turn["context"] < COMPACTION_DROP_RATIO * previous["context"]:
            steps = 0.0
    return out


def session_length_estimates(
    by_session: dict[str, list[dict]], contexts: dict, threshold: int
) -> list[dict]:
    """main のコンテキストが threshold を超えたところで区切っていたら。区切ると土台
    （内訳の used から Messages を除いたもの。内訳が無ければそのセッションの最小の大きさ）から
    作り直すので、その後のステップはそのぶん軽くなる。区切るたびに土台のキャッシュ作成が増え、
    そのぶんを差し引く（重みなしのトークンで）。"""
    saved = 0.0
    restarts = 0
    turns_hit = 0
    sessions_hit = 0
    for session_id, timeline in by_session.items():
        working = [t for t in timeline if t["steps"] > 0]
        if not working:
            continue
        foundation = session_foundation(contexts.get(session_id), working)
        offset = 0.0
        hit = False
        for turn in working:
            effective = turn["context"] - offset
            if effective > threshold and effective > foundation:
                offset += effective - foundation
                restarts += 1
                hit = True
                saved -= foundation
            if offset > 0:
                turns_hit += 1
                saved += offset * turn["steps"]
        sessions_hit += 1 if hit else 0
    if turns_hit < MIN_BASIS_TURNS or saved <= 0:
        return []
    return [
        {
            "kind": "session-length",
            "target": "",
            "estimatedTokens": round(saved),
            "confidence": "medium",
            "bound": "estimate",
            "basis": {"turns": turns_hit, "sessions": sessions_hit, "restarts": restarts},
            "assumptions": {"sessionThreshold": threshold},
            "note": f"main のコンテキストが {threshold:,} を超えたら区切った場合に減る読み − 区切りで増えるキャッシュ作成",
        }
    ]


def session_foundation(usage: dict | None, timeline: list[dict]) -> float:
    if usage:
        used = sum(
            int(c.get("tokens", 0) or 0)
            for c in usage.get("categories", []) or []
            if isinstance(c, dict) and c.get("kind") == "used" and c.get("name") != "Messages"
        )
        if used > 0:
            return float(used)
    return min(t["context"] for t in timeline)


# 見積もりを出さない種類と、その理由（estimates-format.md「見積もりの節（`estimates`）の形」と揃える）。
NOT_ESTIMATED_REASONS = {
    "subagent-share": "比率の診断で、何をどれだけ減らすかの式が無い",
    "cache-reuse": "比率の診断で、何をどれだけ減らすかの式が無い",
    "model-choice": "モデルの単価の違いはトークンの数を変えない。持ち場ごとのモデルの内訳も記録に無く、"
    "移せるターンの割合が推測にしかならない",
}


def not_estimated(emitted_kinds: list[str]) -> list[dict]:
    fixed = [{"kind": k, "reason": r} for k, r in NOT_ESTIMATED_REASONS.items()]
    missing = [
        {"kind": k, "reason": "記録が足りないか、根拠が少なすぎて出せなかった"}
        for k in ("unused-mcp", "memory-file", "skill-definition", "tool-result", "session-length")
        if k not in emitted_kinds
    ]
    return fixed + missing


def impact_of(share: float | None) -> str | None:
    if share is None:
        return None
    if share >= IMPACT_LARGE_PCT:
        return "large"
    if share >= IMPACT_MEDIUM_PCT:
        return "medium"
    return "small"
