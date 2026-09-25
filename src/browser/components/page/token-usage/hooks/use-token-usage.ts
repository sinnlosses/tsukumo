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
  type TokenUsageDays,
  type TokenUsageSummary,
  type TokenUsageTotals,
} from "../../../../../shared/token-usage-summary.ts"
import { rpc } from "../../../../lib/rpc-client.ts"
import { useSessionSelector } from "../../../../stores/session.tsx"
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
  const query = useQuery(
    rpc.tokenUsage.summary.queryOptions({
      input: { days },
      // 開くたびに取り直す（読んでいる間にも増えていくので、前に開いたときの数を見せない）。
      staleTime: 0,
    }),
  )
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
