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
    python3 summarize_usage.py --result-trim 0.3    # 見積もりの仮定を変える（SKILL.md「見積もりの節」）
"""

from __future__ import annotations

import argparse
import json
import os
from datetime import date, timedelta
from pathlib import Path

# 結果のバイト数をトークンに読み替えるときの粗い目安（英数まじりで約4バイト/トークン）。
# 日本語が多いと実際はこれより多くなるので、下限の目安として扱う。
BYTES_PER_TOKEN = 4

# **呼び出しが tools[] に残らないツール。** tsukumo の speak と report は、ツールの呼び出しでは
# なくセリフ・レポートのイベントとして扱われるので（toSessionEvents）、
# 記録の上では常に「0回」に見える。未使用と取り違えないよう、突き合わせから外して別に出す。
UNCOUNTED_TOOL_NAMES = ("mcp__tsukumo__speak", "mcp__tsukumo__report")

# ---- 見積もり（estimates 節）----
# 形を変えたら上げる。読む側（スキル・tsukumo の画面）はこの数で形の変わり目に気づく。
ESTIMATES_VERSION = 2

# トークンの消費量として足す種類。**重みは付けない**（サブスクリプションの利用枠が種類ごとに
# どう数えられるかは公開されておらず、確かめていない）。思考（thinkingTokens）は出力に含まれる
# ので足さない（StepTokenUsage の注記）。
CONSUMED_TOKEN_KEYS = (
    "inputTokens",
    "cacheReadInputTokens",
    "cacheCreationInputTokens",
    "outputTokens",
)

# 効きめの境目（期間のトークンの消費量に占める割合、%）。SKILL.md「見積もりの節」と揃える。
# 費用の割合だった v1 と同じ数のまま。利用枠に照らして較正したものではない。
IMPACT_LARGE_PCT = 3.0
IMPACT_MEDIUM_PCT = 0.5

# 仮定の値の既定（引数で変えられる。使った値は各件の assumptions に載る）。
DEFAULT_RESULT_TRIM = 0.5
DEFAULT_MEMORY_TRIM = 0.3
DEFAULT_SESSION_THRESHOLD = 200_000

# 1ステップあたりのキャッシュ読みが前のターンのこの割合を下回ったら、自動圧縮か作り直しが
# 挟まったとみなし、それより前のツールの結果は持ち越さない。
COMPACTION_DROP_RATIO = 0.5

# 根拠のターンがこれより少ない件は出さない（外れ値を恒常的な浪費と取り違えない）。
MIN_BASIS_TURNS = 3

# 1種類あたりに出す件数の上限（効きの大きい順）。
MAX_ITEMS_PER_KIND = 3


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
                records.append(json.loads(line))
            except json.JSONDecodeError:
                broken += 1
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


def coverage(turns: dict, sessions: dict) -> dict:
    records = turns["records"]
    with_breakdown = sum(1 for r in records if isinstance(r.get("breakdown"), dict))
    return {
        "turn_days": turns["found_days"],
        "turn_days_missing": turns["missing_days"],
        "turns": len(records),
        "turns_with_breakdown": with_breakdown,
        "turns_without_breakdown": len(records) - with_breakdown,
        "turn_broken_lines": turns["broken_lines"],
        "session_days": sessions["found_days"],
        "session_days_missing": sessions["missing_days"],
        "session_lines": sessions["lines"],
        "sessions": len(sessions["sessions"]),
        "session_broken_lines": sessions["broken_lines"],
    }


def totals(records: list[dict]) -> dict:
    """ターンの合計は models が正典（サブエージェントぶんも含む累計の差）。"""
    keys = (
        "inputTokens",
        "outputTokens",
        "thinkingTokens",
        "cacheReadInputTokens",
        "cacheCreationInputTokens",
    )
    overall = {k: 0 for k in keys} | {"costUsd": 0.0, "turns": 0}
    by_mode: dict[str, dict] = {}
    by_model: dict[str, dict] = {}
    for record in records:
        models = record.get("models")
        if not isinstance(models, list):
            continue
        mode = str(record.get("mode", "unknown"))
        mode_row = by_mode.setdefault(mode, {k: 0 for k in keys} | {"costUsd": 0.0, "turns": 0})
        overall["turns"] += 1
        mode_row["turns"] += 1
        for usage in models:
            if not isinstance(usage, dict):
                continue
            name = str(usage.get("model", "unknown"))
            model_row = by_model.setdefault(name, {k: 0 for k in keys} | {"costUsd": 0.0})
            for key in keys:
                value = int(usage.get(key, 0) or 0)
                overall[key] += value
                mode_row[key] += value
                model_row[key] += value
            cost = float(usage.get("costUsd", 0) or 0)
            overall["costUsd"] += cost
            mode_row["costUsd"] += cost
            model_row["costUsd"] += cost
    for row in [overall, *by_mode.values(), *by_model.values()]:
        row["consumedTokens"] = sum(row[k] for k in CONSUMED_TOKEN_KEYS)
    consumed = overall["consumedTokens"]
    overall["typeSharePct"] = {
        k: (round(100 * overall[k] / consumed, 2) if consumed else None) for k in CONSUMED_TOKEN_KEYS
    }
    cache_read = overall["cacheReadInputTokens"]
    cache_creation = overall["cacheCreationInputTokens"]
    overall["cacheReadPerCreation"] = round(cache_read / cache_creation, 2) if cache_creation else None
    return {"overall": overall, "by_mode": by_mode, "by_model": by_model}


def scopes(records: list[dict]) -> dict:
    """持ち場（main / subagent）の割り振り。outputTokens は確定値でないので下限として読む。"""
    keys = ("inputTokens", "outputTokens", "cacheReadInputTokens", "cacheCreationInputTokens")
    rows = {
        scope: {k: 0 for k in keys} | {"steps": 0, "calls": 0, "resultBytes": 0}
        for scope in ("main", "subagent")
    }
    counted = 0
    for record in records:
        breakdown = record.get("breakdown")
        if not isinstance(breakdown, dict):
            continue
        counted += 1
        for scope in ("main", "subagent"):
            part = breakdown.get(scope)
            if not isinstance(part, dict):
                continue
            row = rows[scope]
            row["steps"] += int(part.get("steps", 0) or 0)
            tokens = part.get("tokens")
            if isinstance(tokens, dict):
                for key in keys:
                    row[key] += int(tokens.get(key, 0) or 0)
            for tool in part.get("tools", []) or []:
                if not isinstance(tool, dict):
                    continue
                row["calls"] += int(tool.get("calls", 0) or 0)
                row["resultBytes"] += int(tool.get("resultBytes", 0) or 0)
    read_total = sum(rows[s]["inputTokens"] + rows[s]["cacheReadInputTokens"] for s in rows)
    for scope, row in rows.items():
        read = row["inputTokens"] + row["cacheReadInputTokens"]
        row["readTokens"] = read
        row["readShare"] = round(100 * read / read_total, 1) if read_total else None
        # 1歩（assistant の1ステップ）ごとに文脈を丸ごと読み直すので、これが1歩の重さの平均。
        row["readPerStep"] = round(read / row["steps"]) if row["steps"] else None
    return {"turns_counted": counted, "rows": rows}


def tools(records: list[dict]) -> dict:
    """ツール名ごとの呼び出し回数と結果の大きさ（持ち場ごとにも分ける）。"""
    rows: dict[str, dict] = {}
    for record in records:
        breakdown = record.get("breakdown")
        if not isinstance(breakdown, dict):
            continue
        for scope in ("main", "subagent"):
            part = breakdown.get(scope)
            if not isinstance(part, dict):
                continue
            for tool in part.get("tools", []) or []:
                if not isinstance(tool, dict):
                    continue
                name = str(tool.get("name", "unknown"))
                row = rows.setdefault(
                    name,
                    {"name": name, "calls": 0, "resultBytes": 0, "subagentCalls": 0},
                )
                calls = int(tool.get("calls", 0) or 0)
                row["calls"] += calls
                row["resultBytes"] += int(tool.get("resultBytes", 0) or 0)
                if scope == "subagent":
                    row["subagentCalls"] += calls
    for row in rows.values():
        row["bytesPerCall"] = round(row["resultBytes"] / row["calls"]) if row["calls"] else 0
        row["approxTokens"] = round(row["resultBytes"] / BYTES_PER_TOKEN)
    return {
        "by_bytes": sorted(rows.values(), key=lambda r: -r["resultBytes"]),
        "by_calls": sorted(rows.values(), key=lambda r: -r["calls"]),
    }


def context(sessions: list[dict]) -> dict:
    """セッションごとの内訳を畳む。判定は kind で行い name では行わない。deferred は窓の外。"""
    if not sessions:
        return {"sessions": 0, "categories": [], "items": {}, "models": {}}
    category_totals: dict[tuple[str, str], dict] = {}
    used_totals: list[int] = []
    deferred_totals: list[int] = []
    max_tokens: list[int] = []
    models: dict[str, int] = {}
    items: dict[str, dict[str, dict]] = {"memoryFiles": {}, "skills": {}, "mcpTools": {}}
    for record in sessions:
        usage = record["usage"]
        models[str(usage.get("model", "unknown"))] = models.get(str(usage.get("model", "unknown")), 0) + 1
        max_tokens.append(int(usage.get("maxTokens", 0) or 0))
        used = 0
        deferred = 0
        for category in usage.get("categories", []) or []:
            if not isinstance(category, dict):
                continue
            name = str(category.get("name", "unknown"))
            kind = str(category.get("kind", "unknown"))
            value = int(category.get("tokens", 0) or 0)
            row = category_totals.setdefault(
                (name, kind), {"name": name, "kind": kind, "tokens": 0, "sessions": 0}
            )
            row["tokens"] += value
            row["sessions"] += 1
            if kind == "used":
                used += value
            elif kind == "deferred":
                deferred += value
        used_totals.append(used)
        deferred_totals.append(deferred)
        for field in items:
            for item in usage.get(field, []) or []:
                if not isinstance(item, dict):
                    continue
                name = str(item.get("name", "unknown"))
                row = items[field].setdefault(
                    name,
                    {"name": name, "source": str(item.get("source", "")), "tokens": 0, "sessions": 0},
                )
                row["tokens"] += int(item.get("tokens", 0) or 0)
                row["sessions"] += 1
    count = len(sessions)
    categories = [
        {**row, "avgTokens": round(row["tokens"] / row["sessions"])}
        for row in sorted(category_totals.values(), key=lambda r: -r["tokens"] / max(r["sessions"], 1))
    ]
    folded = {
        field: sorted(
            (
                {**row, "avgTokens": round(row["tokens"] / row["sessions"])}
                for row in rows.values()
            ),
            key=lambda r: -r["avgTokens"],
        )
        for field, rows in items.items()
    }
    return {
        "sessions": count,
        "models": models,
        "avgMaxTokens": round(sum(max_tokens) / count) if count else 0,
        "avgUsedTokens": round(sum(used_totals) / count) if count else 0,
        "avgDeferredTokens": round(sum(deferred_totals) / count) if count else 0,
        "categories": categories,
        "items": folded,
    }


def unused_mcp_tools(records: list[dict], sessions: list[dict]) -> dict:
    """定義は積んでいるのに期間中1度も呼ばれていない MCP ツール。

    突き合わせができるのは MCP ツールだけ。`mcp__<server>__<tool>` の名前が
    token-usage の tools[].name にそのまま出るため。スキルは呼び出しが `Skill` という
    名前でしか残らないので、ここでは扱わない（「使っていない」と断定しない）。
    """
    called: dict[str, int] = {}
    for record in records:
        breakdown = record.get("breakdown")
        if not isinstance(breakdown, dict):
            continue
        for scope in ("main", "subagent"):
            part = breakdown.get(scope)
            if not isinstance(part, dict):
                continue
            for tool in part.get("tools", []) or []:
                if isinstance(tool, dict):
                    name = str(tool.get("name", ""))
                    called[name] = called.get(name, 0) + int(tool.get("calls", 0) or 0)
    defined: dict[str, dict] = {}
    for record in sessions:
        for item in record["usage"].get("mcpTools", []) or []:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name", "unknown"))
            row = defined.setdefault(
                name,
                {"name": name, "server": str(item.get("source", "")), "tokens": 0, "sessions": 0},
            )
            row["tokens"] += int(item.get("tokens", 0) or 0)
            row["sessions"] += 1
    rows = []
    for row in defined.values():
        avg = round(row["tokens"] / row["sessions"])
        rows.append({**row, "avgTokens": avg, "calls": called.get(row["name"], 0)})
    counted = [r for r in rows if r["name"] not in UNCOUNTED_TOOL_NAMES]
    uncounted = sorted(
        (r for r in rows if r["name"] in UNCOUNTED_TOOL_NAMES), key=lambda r: -r["avgTokens"]
    )
    unused = sorted((r for r in counted if r["calls"] == 0), key=lambda r: -r["avgTokens"])
    by_server: dict[str, dict] = {}
    for row in counted:
        server = by_server.setdefault(
            row["server"], {"server": row["server"], "tools": 0, "unusedTools": 0, "avgTokens": 0, "unusedAvgTokens": 0, "calls": 0}
        )
        server["tools"] += 1
        server["avgTokens"] += row["avgTokens"]
        server["calls"] += row["calls"]
        if row["calls"] == 0:
            server["unusedTools"] += 1
            server["unusedAvgTokens"] += row["avgTokens"]
    return {
        "defined": len(rows),
        "matchable": len(counted),
        "unused": len(unused),
        "unusedAvgTokens": sum(r["avgTokens"] for r in unused),
        "definedAvgTokens": sum(r["avgTokens"] for r in rows),
        "rows": unused,
        "uncounted": uncounted,
        "servers": sorted(by_server.values(), key=lambda r: -r["unusedAvgTokens"]),
    }


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
            "割合の分母は種類を重みなしで足したトークンの消費量。サブスクリプションの利用枠が種類ごとに"
            "どう数えられるかは公開されておらず確かめていないので、利用枠に占める割合とは言えない",
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


def unused_mcp_estimates(
    by_session: dict[str, list[dict]], contexts: dict, unused: dict, coverage_info: dict
) -> list[dict]:
    """未使用の MCP ツールをサーバごと外したら。deferred は窓の外なので、各セッションの
    MCP の分類の used / (used + deferred) の比で窓に入っているぶんだけを数える
    （どのツールが deferred かは記録に無いので按分する）。"""
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


def memory_estimates(
    by_session: dict[str, list[dict]], contexts: dict, coverage_info: dict, trim: float
) -> list[dict]:
    """メモリファイルを trim 割削ったら。作業ツリーごとの CLAUDE.md は1セッションに1つしか
    載らないので、Project のものはファイル名で束ねる（対象はファイル名になる）。"""
    groups: set[str] = set()
    for usage in contexts.values():
        for item in usage.get("memoryFiles", []) or []:
            if isinstance(item, dict):
                groups.add(memory_group(item))
    items = []
    for group in sorted(groups):

        def tokens_of(usage: dict, group: str = group) -> float:
            return sum(
                int(i.get("tokens", 0) or 0)
                for i in usage.get("memoryFiles", []) or []
                if isinstance(i, dict) and memory_group(i) == group
            )

        item = definition_item(
            "memory-file",
            group,
            definition_reads(by_session, contexts, tokens_of),
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


# 見積もりを出さない種類と、その理由（SKILL.md「見積もりの節」と揃える）。
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


def top_items(items: list[dict]) -> list[dict]:
    return sorted(items, key=lambda r: -r["estimatedTokens"])[:MAX_ITEMS_PER_KIND]


def impact_of(share: float | None) -> str | None:
    if share is None:
        return None
    if share >= IMPACT_LARGE_PCT:
        return "large"
    if share >= IMPACT_MEDIUM_PCT:
        return "medium"
    return "small"


def lower_confidence(confidence: str) -> str:
    return {"high": "medium", "medium": "low"}.get(confidence, "low")


def clamp_ratio(value: float) -> float:
    return min(max(value, 0.0), 1.0)


def render(report: dict, top: int) -> str:
    out: list[str] = []
    add = out.append
    rng = report["range"]
    cov = report["coverage"]
    add("# tsukumo 使用量の集計")
    add(f"期間: {rng['since']}〜{rng['until']}（{rng['requested_days']}日）/ 置き場: {rng['home']}")
    add(
        f"ターンの記録: {len(cov['turn_days'])}/{rng['requested_days']} 日ぶん、{cov['turns']} 行"
        f"（内訳の取れた行 {cov['turns_with_breakdown']}/{cov['turns']}）"
    )
    if cov["turn_days_missing"]:
        add(f"  記録の無い日: {fold_days(cov['turn_days_missing'])}")
    add(
        f"セッションの記録: {len(cov['session_days'])}/{rng['requested_days']} 日ぶん、"
        f"{cov['sessions']} セッション（{cov['session_lines']} 行を畳んだもの）"
    )
    if cov["session_days_missing"]:
        add(f"  記録の無い日: {fold_days(cov['session_days_missing'])}")
    if cov["turn_broken_lines"] or cov["session_broken_lines"]:
        add(f"  読めなかった行: ターン {cov['turn_broken_lines']} / セッション {cov['session_broken_lines']}")
    if cov["turns"] == 0 and cov["sessions"] == 0:
        add("")
        add("**この期間の記録が1件も無い。** 提案の根拠が無いので、まず記録がある期間を "
            "--since / --until で指すか、置き場（TSUKUMO_HOME）を確かめる。")
        out += render_estimates(report["estimates"])
        return "\n".join(out)

    add("")
    add("## 1. 合計（models が正典。ターンの増分の合計）")
    overall = report["totals"]["overall"]
    days_with_data = max(len(cov["turn_days"]), 1)
    turns_count = max(overall["turns"], 1)
    add(f"ターン数 {overall['turns']} / 記録のある日 {len(cov['turn_days'])} 日")
    add(
        f"入力 {num(overall['inputTokens'])} / 出力 {num(overall['outputTokens'])} / "
        f"思考 {num(overall['thinkingTokens'])}"
    )
    add(
        f"キャッシュ読み {num(overall['cacheReadInputTokens'])} / "
        f"キャッシュ作成 {num(overall['cacheCreationInputTokens'])}"
        + (
            f"（読み/作成 = {overall['cacheReadPerCreation']} 倍）"
            if overall["cacheReadPerCreation"] is not None
            else ""
        )
    )
    consumed = overall["consumedTokens"]
    add(
        f"トークンの消費量 {num(consumed)}（1日あたり {num(consumed / days_with_data)}、"
        f"1ターンあたり {num(consumed / turns_count)}。入力・キャッシュ読み・キャッシュ作成・出力を"
        "重みなしで足した数。思考は出力に含まれるので足さない）"
    )
    shares = overall["typeSharePct"]
    labels = {
        "inputTokens": "入力",
        "cacheReadInputTokens": "キャッシュ読み",
        "cacheCreationInputTokens": "キャッシュ作成",
        "outputTokens": "出力（思考を含む）",
    }
    add(
        "  種類の内訳: "
        + " / ".join(
            f"{labels[k]} {shares[k]}%" if shares[k] is not None else f"{labels[k]} —" for k in labels
        )
    )
    add("  ※ 利用枠が種類ごとにどう数えられるかは公開されておらず確かめていない。この割合は数の比でしかない")
    add(
        f"  参考: API の単価で換算した費用 ${overall['costUsd']:.2f}"
        "（サブスクリプションでは払っていない額。提案の物差しには使わない）"
    )
    for mode, row in sorted(report["totals"]["by_mode"].items()):
        add(
            f"  {mode}: {row['turns']} ターン / 消費 {num(row['consumedTokens'])} / "
            f"読み {num(row['cacheReadInputTokens'])} / 作成 {num(row['cacheCreationInputTokens'])}"
        )
    for model, row in sorted(report["totals"]["by_model"].items(), key=lambda kv: -kv[1]["consumedTokens"]):
        add(
            f"  {model}: 消費 {num(row['consumedTokens'])} / 読み {num(row['cacheReadInputTokens'])} / "
            f"出力 {num(row['outputTokens'])}"
        )

    add("")
    add("## 2. 持ち場（main と subagent の割り振り）")
    scope_data = report["scopes"]
    add(f"内訳の取れたターン {scope_data['turns_counted']} 件")
    for scope, row in scope_data["rows"].items():
        share = f"{row['readShare']}%" if row["readShare"] is not None else "—"
        per_step = num(row["readPerStep"]) if row["readPerStep"] is not None else "—"
        add(
            f"  {scope:9s} 読み込み {num(row['readTokens'])}（{share}） / ステップ {row['steps']}"
            f"（1歩あたり {per_step}） / "
            f"ツール {row['calls']} 回 / 結果 {mib(row['resultBytes'])}"
        )
    add("  ※ outputTokens は確定値でないので合計より小さく出る。割り振りは入力とキャッシュ読みで見る")
    add("  ※ 1歩あたり = 読み込み ÷ ステップ。1歩ごとに文脈を丸ごと読み直すので、歩を1つ増やす重さの平均")

    add("")
    add(f"## 3. ツール別の結果の大きさ（上位 {top}）")
    add("  名前                         回数    結果      1回あたり  ≈トークン")
    for row in report["tools"]["by_bytes"][:top]:
        add(
            f"  {row['name']:28s} {row['calls']:6d}  {mib(row['resultBytes']):>9s}  "
            f"{num(row['bytesPerCall']):>9s}  {num(row['approxTokens']):>9s}"
        )
    add(f"  ※ ≈トークンは {BYTES_PER_TOKEN} バイト/トークンの粗い目安（日本語が多いともっと増える）")

    ctx = report["context"]
    add("")
    add("## 4. コンテキストの内訳（セッション平均）")
    if ctx["sessions"] == 0:
        add("  内訳の記録がこの期間に1件も無い。**メモリファイル・スキル・MCP 定義の重さは出せない。**")
        add("  このままだと『定義は重いが呼ばれていないツール』も出せないので、断って答える")
    else:
        add(f"  セッション {ctx['sessions']} 件 / 窓 {num(ctx['avgMaxTokens'])} / 使用 {num(ctx['avgUsedTokens'])}（deferred {num(ctx['avgDeferredTokens'])} は窓の外）")
        for row in ctx["categories"]:
            add(f"    {row['name']:26s} {num(row['avgTokens']):>9s}  [{row['kind']}]")
        add("")
        add(f"  メモリファイル（上位 {top}）")
        for row in ctx["items"]["memoryFiles"][:top]:
            add(f"    {num(row['avgTokens']):>8s}  {row['source']:10s} {row['name']}")
        add("")
        skills = ctx["items"]["skills"]
        skills_total = sum(r["avgTokens"] for r in skills)
        add(f"  スキルの定義（{len(skills)} 件 / 合計 {num(skills_total)}。重い順に上位 {top}）")
        for row in skills[:top]:
            add(f"    {num(row['avgTokens']):>8s}  {row['source']:14s} {row['name']}")
        add("    ※ どのスキルが呼ばれたかは記録に残らない（呼び出しは `Skill` という名前だけ）。")
        add("      **使っていないと断定しない。** 重さの一覧として出し、要否は利用者が決める")

    add("")
    add("## 5. 定義は積んでいるが期間中1度も呼ばれていない MCP ツール")
    unused = report["unused_mcp_tools"]
    if ctx["sessions"] == 0 or unused["defined"] == 0:
        add("  内訳の記録が無いので突き合わせができない（MCP ツールの定義が読めない）")
    elif scope_data["turns_counted"] == 0:
        add("  ターンの内訳が無いので呼び出し実績と突き合わせられない")
    else:
        add(
            f"  定義 {unused['defined']} 件（うち突き合わせできる {unused['matchable']} 件）/ "
            f"未使用 {unused['unused']} 件 / 未使用の重さ {num(unused['unusedAvgTokens'])}"
            f"（定義の合計 {num(unused['definedAvgTokens'])}、1セッションあたり）"
        )
        for row in unused["servers"]:
            if row["unusedTools"] == 0:
                continue
            add(
                f"    {row['server']:26s} 未使用 {row['unusedTools']}/{row['tools']} 件 = "
                f"{num(row['unusedAvgTokens'])}（サーバ全体の呼び出し {row['calls']} 回）"
            )
        add(f"  重い順に上位 {top}:")
        for row in unused["rows"][:top]:
            add(f"    {num(row['avgTokens']):>8s}  {row['name']}")
        if unused["uncounted"]:
            names = "、".join(f"{r['name']}（{num(r['avgTokens'])}）" for r in unused["uncounted"])
            add(f"  突き合わせから外したもの: {names}")
            add("    ※ 呼び出しが tools[] に残らない作りなので常に0回に見える。**未使用ではない**")
    out += render_estimates(report["estimates"])
    return "\n".join(out)


def render_estimates(est: dict) -> list[str]:
    out = ["", f"## 6. 見積もり（**測った数ではない**。提案を実行していたら期間中に減っていた量の推定、v{est['version']}）"]
    if est["status"] != "ok":
        out.append("  **見積もりは出せない。**")
        out += [f"  - {reason}" for reason in est["reasons"]]
        return out
    denominator = est["denominator"]
    out.append(
        f"  割合の分母: 期間のトークンの消費量 {num(denominator['value'])}（重みなし）/ 効きめ: {est['thresholds']['largePct']}%以上=大、"
        f"{est['thresholds']['mediumPct']}%以上=中、それ未満=小"
    )
    out.append("  種類              対象                          ≈減るトークン  割合   効きめ 確かさ 根拠")
    labels = {"large": "大", "medium": "中", "small": "小", "high": "高", "low": "低"}
    for item in est["items"]:
        basis = item["basis"]
        target = item["target"] or "-"
        if len(target) > 28:
            target = "…" + target[-27:]
        bound = "（上限）" if item["bound"] == "upper" else ""
        out.append(
            f"  {item['kind']:17s} {target:28s} {num(item['estimatedTokens']):>14s}  "
            f"{item['sharePct']:>5.2f}%  "
            f"{labels.get(item['impact'], '—'):2s}   {labels.get(item['confidence'], '中'):2s}   "
            f"{basis['turns']}ターン/{basis['sessions']}セッション{bound}"
        )
    out.append(
        f"  上の割合を足すと {est['upperBoundSharePct']}% だが、**同じキャッシュ読みを削り合うので"
        "重なりを除いていない上限**（足した数を「減らせる量」と言わない）"
    )
    assumed = est["assumptions"]
    out.append(
        f"  仮定: 結果を絞れる割合 {assumed['resultTrim']} / メモリを削れる割合 {assumed['memoryTrim']} / "
        f"区切るしきい値 {num(assumed['sessionThreshold'])}（--result-trim / --memory-trim / --session-threshold）"
    )
    for note in est["caveats"] + est["reasons"]:
        out.append(f"  - {note}")
    skipped = "、".join(r["kind"] for r in est["notEstimated"])
    out.append(f"  見積もりを出していない種類: {skipped}（理由は --json の notEstimated）")
    return out


def fold_days(days: list[str]) -> str:
    if len(days) <= 4:
        return "、".join(days)
    return f"{days[0]}〜{days[-1]} のうち {len(days)} 日"


def num(value: float) -> str:
    return f"{round(value):,}"


def mib(value: int) -> str:
    if value >= 1024 * 1024:
        return f"{value / 1024 / 1024:.1f}MB"
    if value >= 1024:
        return f"{value / 1024:.0f}KB"
    return f"{value}B"


if __name__ == "__main__":
    raise SystemExit(main())
