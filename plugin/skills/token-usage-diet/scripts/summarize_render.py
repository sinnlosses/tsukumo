"""集計を人が読む表（標準出力の文字列）に整える。"""

from __future__ import annotations

from summarize_aggregate import BYTES_PER_TOKEN


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
    add("  ※ 上限が種類ごとにどう数えられるかは公開されておらず確かめていない。この割合は数の比でしかない")
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
        add(f"  セッション {ctx['sessions']} 件 / コンテキストウィンドウ {num(ctx['avgMaxTokens'])} / 使用 {num(ctx['avgUsedTokens'])}（deferred {num(ctx['avgDeferredTokens'])} はコンテキストウィンドウの外）")
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
