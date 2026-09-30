// トークン消費の画面のロジック。
// 期間の選択（`days`）と集計の取得を持ち、画面に出す文字と棒の割合へ畳む。
//
// 「まだ届いていない」も「取れなかった」も、描く側から見れば空の集計。取れなかったことは `report` の `failed` で区別する。

import { useQuery } from "@tanstack/react-query"
import { useState } from "react"

import {
  DEFAULT_TOKEN_USAGE_DAYS,
  EMPTY_TOKEN_USAGE_SUMMARY,
  TOKEN_USAGE_DAYS_CHOICES,
  type ModelUsageTotal,
  type TokenUsageDays,
  type TokenUsageTotals,
  type TokenUsageTrend,
} from "../../../../../shared/token-usage/token-usage-summary.ts"
import type { ToolUsageCount } from "../../../../../shared/token-usage/token-usage.ts"
import { rpc } from "../../../../domain/rpc.ts"
import { useSession } from "../../../../stores/session.ts"
import { formatCount } from "../../../../utils/format-count.ts"
import { formatBytes, totalUsage } from "../domain/usage-format.ts"

/**
 * ツール別に並べる件数。
 * 上から数件で「何が文脈を食ったか」は分かるので、初めは全部を出さずに残りの件数だけを添える（数十種類が並ぶと表の意味が薄れる）。
 */
const TOOL_ROWS = 6

export type PeriodChoiceView = {
  readonly days: TokenUsageDays
  readonly label: string
  readonly pressed: boolean
}

export type PeriodCardView = {
  readonly label: string
  /** 期間の合計（書き終えた文字列）。 */
  readonly value: string
  /** 棒にする数を合計の並びから1つ選ぶ。 */
  readonly pick: (totals: TokenUsageTotals) => number
}

export type ModelRowView = {
  readonly model: string
  readonly input: string
  readonly output: string
  /** 出力の列の最大に対する割合（`--usage-bar-share` に渡す字）。 */
  readonly outputShare: string
  readonly cacheRead: string
  readonly cacheCreation: string
}

export type ToolRowView = {
  readonly name: string
  readonly calls: number
  readonly size: string
  /** 結果の大きさの列の最大に対する割合（`--usage-bar-share` に渡す字）。 */
  readonly share: string
}

export type ToolTableView = {
  readonly rows: readonly ToolRowView[]
  readonly more:
    | { readonly kind: "none" }
    | { readonly kind: "some"; readonly label: string; readonly onToggle: () => void }
}

export type TokenUsageReport =
  | { readonly kind: "failed" }
  | { readonly kind: "empty" }
  | {
      readonly kind: "ready"
      readonly periodCards: readonly PeriodCardView[]
      readonly trend: TokenUsageTrend
      readonly models: readonly ModelRowView[]
      readonly tools: ToolTableView
    }

export type UseTokenUsageResult = {
  readonly days: TokenUsageDays
  readonly onDaysChange: (days: TokenUsageDays) => void
  readonly periodChoices: readonly PeriodChoiceView[]
  readonly report: TokenUsageReport
  /** プラン。まだ届いていない・取れなかったときは undefined。 */
  readonly plan: string | undefined
}

export function useTokenUsage(): UseTokenUsageResult {
  const [days, setDays] = useState<TokenUsageDays>(DEFAULT_TOKEN_USAGE_DAYS)
  const [toolsExpanded, setToolsExpanded] = useState(false)
  const query = useQuery(
    rpc.tokenUsage.summary.queryOptions({
      input: { days },
      // 開くたびに取り直す（読んでいる間にも増えていくので、前に開いたときの数を見せない）。
      staleTime: 0,
    }),
  )
  const summary = query.data ?? EMPTY_TOKEN_USAGE_SUMMARY
  const plan = useSession((session) => session.state.plan)

  return {
    days,
    onDaysChange: (next) => {
      setDays(next)
      setToolsExpanded(false)
    },
    periodChoices: TOKEN_USAGE_DAYS_CHOICES.map((choice) => ({
      days: choice,
      label: daysLabel(choice),
      pressed: choice === days,
    })),
    report: reportOf({
      isError: query.isError,
      byModel: summary.byModel,
      byTool: summary.byTool,
      trend: summary.trend,
      toolsExpanded,
      onToolsToggle: () => {
        setToolsExpanded((current) => !current)
      },
    }),
    plan,
  }
}

type ReportSource = {
  readonly isError: boolean
  readonly byModel: readonly ModelUsageTotal[]
  readonly byTool: readonly ToolUsageCount[]
  readonly trend: TokenUsageTrend
  readonly toolsExpanded: boolean
  readonly onToolsToggle: () => void
}

function reportOf(source: ReportSource): TokenUsageReport {
  if (source.isError) {
    return { kind: "failed" }
  }
  // 記録が1件も無い期間かどうかはモデル別で見る。
  // 推移は期間のすべての刻みが0で並ぶので長さでは分からない。
  // 行はモデルの増分が1つでもあるときにだけ積まれるので、モデル別が空なら行が無い。
  if (source.byModel.length === 0) {
    return { kind: "empty" }
  }
  const total = totalUsage(source.byModel)
  return {
    kind: "ready",
    periodCards: [
      { label: "入力", value: formatCount(total.inputTokens), pick: (t) => t.inputTokens },
      { label: "出力", value: formatCount(total.outputTokens), pick: (t) => t.outputTokens },
      {
        label: "キャッシュ読み",
        value: formatCount(total.cacheReadInputTokens),
        pick: (t) => t.cacheReadInputTokens,
      },
      {
        label: "キャッシュ作成",
        value: formatCount(total.cacheCreationInputTokens),
        pick: (t) => t.cacheCreationInputTokens,
      },
    ],
    trend: source.trend,
    models: modelRowsOf(source.byModel),
    tools: toolTableOf(source.byTool, source.toolsExpanded, source.onToolsToggle),
  }
}

/** 届く順（出力の多い順。同じなら名前順）のまま行にする。 */
function modelRowsOf(byModel: readonly ModelUsageTotal[]): readonly ModelRowView[] {
  const peak = Math.max(0, ...byModel.map((entry) => entry.totals.outputTokens))
  return byModel.map((entry) => ({
    model: entry.model,
    input: formatCount(entry.totals.inputTokens),
    output: formatCount(entry.totals.outputTokens),
    outputShare: barShare(entry.totals.outputTokens, peak),
    cacheRead: formatCount(entry.totals.cacheReadInputTokens),
    cacheCreation: formatCount(entry.totals.cacheCreationInputTokens),
  }))
}

function toolTableOf(
  byTool: readonly ToolUsageCount[],
  expanded: boolean,
  onToggle: () => void,
): ToolTableView {
  const peak = Math.max(0, ...byTool.map((tool) => tool.resultBytes))
  const rest = byTool.length - TOOL_ROWS
  const shown = expanded ? byTool : byTool.slice(0, TOOL_ROWS)
  return {
    rows: shown.map((tool) => ({
      name: tool.name,
      calls: tool.calls,
      size: formatBytes(tool.resultBytes),
      share: barShare(tool.resultBytes, peak),
    })),
    more:
      rest > 0
        ? { kind: "some", label: expanded ? "閉じる" : `ほか ${rest} 件を見る`, onToggle }
        : { kind: "none" },
  }
}

/** 期間の名乗り。1日だけは「今日」（棒も時間ごとに割れるので、日数では読み違える）。 */
function daysLabel(days: TokenUsageDays): string {
  return days === 1 ? "今日" : `${days}日`
}

/** 棒の幅（その列の最大に対する割合）。最大が0なら全部0%。 */
function barShare(value: number, peak: number): string {
  return peak === 0 ? "0%" : `${(value / peak) * 100}%`
}
