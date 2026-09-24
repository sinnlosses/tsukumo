// トークン消費の画面のロジック（docs/design.md 2章「機能の中を分ける」）。期間の選択（`days`）と
// 集計の取得（TanStack Query）を持ち、見た目（`presentational-token-usage-screen.tsx`）が
// 算出せずにそのまま描ける形（合計込みの集計と、取れなかったかどうか）へ畳む。
//
// **「まだ届いていない」も「取れなかった」も、描く側から見れば空の集計**（`| undefined` を
// 内側へ運ばない）。取れなかったことは `isError` で区別する。

import { useQuery } from "@tanstack/react-query"
import { useState } from "react"

import {
  DEFAULT_TOKEN_USAGE_DAYS,
  EMPTY_TOKEN_USAGE_SUMMARY,
  readTokenUsageSummary,
  TOKEN_USAGE_DAYS_QUERY_NAME,
  TOKEN_USAGE_SUMMARY_PATH,
  type TokenUsageDays,
  type TokenUsageSummary,
  type TokenUsageTotals,
} from "../../../../shared/token-usage-summary.ts"
import { sessionTokenUrl } from "../../../lib/session-token-url.ts"
import { useSessionSelector } from "../../../stores/session.tsx"
import { totalUsage } from "../usage-format.ts"

export type UseTokenUsageResult = {
  readonly days: TokenUsageDays
  readonly onDaysChange: (days: TokenUsageDays) => void
  readonly summary: TokenUsageSummary
  readonly total: TokenUsageTotals
  readonly isError: boolean
  /** プラン（`docs/glossary.md`「プラン」）。まだ届いていない・取れなかったときは undefined。 */
  readonly plan: string | undefined
}

export function useTokenUsage(): UseTokenUsageResult {
  const [days, setDays] = useState<TokenUsageDays>(DEFAULT_TOKEN_USAGE_DAYS)
  const query = useQuery({
    queryKey: ["token-usage", days],
    queryFn: () => fetchTokenUsageSummary(days),
    // 開くたびに取り直す（読んでいる間にも増えていくので、前に開いたときの数を見せない）。
    staleTime: 0,
  })
  const summary = query.data ?? EMPTY_TOKEN_USAGE_SUMMARY
  const plan = useSessionSelector((session) => session.state.plan)

  return {
    days,
    onDaysChange: setDays,
    summary,
    total: totalUsage(summary.byModel),
    isError: query.isError,
    plan,
  }
}

/**
 * 集計を取りに行く。**配られない形だったときは空の集計**（`readTokenUsageSummary`）。403 や
 * 落ちた応答は例外にせず `response.ok` で分けて、取れなかったことは呼び出し側の `isError` で
 * 伝える。
 */
export async function fetchTokenUsageSummary(days: TokenUsageDays): Promise<TokenUsageSummary> {
  const response = await fetch(tokenUsageSummaryUrl(days))
  if (!response.ok) {
    throw new Error(String(response.status))
  }
  return readTokenUsageSummary(await response.json())
}

/**
 * 集計の URL。**起動トークンを付ける**（`/repository-file` と同じ守り方。
 * `lib/session-token-url.ts` に寄せた）。日数は経路ごとの追加のクエリとして渡す。
 */
function tokenUsageSummaryUrl(days: TokenUsageDays): string {
  return sessionTokenUrl(TOKEN_USAGE_SUMMARY_PATH, {
    [TOKEN_USAGE_DAYS_QUERY_NAME]: String(days),
  })
}
