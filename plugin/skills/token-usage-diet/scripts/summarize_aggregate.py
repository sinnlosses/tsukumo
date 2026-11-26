"""読み込んだ記録の集計（取れた範囲・合計・持ち場・ツール・コンテキストの内訳・未使用の MCP ツール）。"""

from __future__ import annotations

# 結果のバイト数をトークンに読み替えるときの粗い目安（英数まじりで約4バイト/トークン）。
# 日本語が多いと実際はこれより多くなるので、下限の目安として扱う。
BYTES_PER_TOKEN = 4

# 呼び出しが tools[] に残らないツール（speak と report はイベント扱いで常に「0回」に見える）。
# 未使用と取り違えないよう、突き合わせから外して別に出す。
UNCOUNTED_TOOL_NAMES = ("mcp__tsukumo__speak", "mcp__tsukumo__report")

# トークンの消費量として足す種類。重みは付けない（上限の数え方は非公開）。
# 思考（thinkingTokens）は出力に含まれるので足さない。
CONSUMED_TOKEN_KEYS = (
    "inputTokens",
    "cacheReadInputTokens",
    "cacheCreationInputTokens",
    "outputTokens",
)


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
    """セッションごとの内訳を畳む。"""
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
