// プラン使用量を取りに行き、サイドバーの札（`PlanUsageRow`）が算出せずにそのまま描ける形へ畳む。
// 取り直す契機は開いたとき・ターンが終わるたび・再読み込みのボタンと、「該当しない」が返った間の列。
// 「いつ取り直すか」は自分では決めず、`finishedTurnCount` を呼び出し側から受け取り、値が変われば取り直す。
// ボタンからの取り直しだけは鍵を変えずに `retry()`（`query.refetch()`）で行う。
// 「該当しない」が返った間は、取り直しの列（`NOT_APPLICABLE_RETRY_DELAYS_MS`）が終わるまで取得中に見せる。
// 列は鍵ごとに数え直し、ボタンでの取り直しでは始めない。
//
// 前の値を残したまま取り直す（`placeholderData: keepPreviousData`）。
// 見本（`QUOTA-Sidebar.dc.html`「3a 取得中（前の値あり）」）が前の値を薄く残すことを求めている。
// 鍵が変わるクエリは既定では骨組みに戻るので、前の成功結果をプレースホルダとして持ち越して、ボタンでの取り直しと同じ見え方に揃える。
// 「まだ一度も取れていない」（`query.isPending`）だけがプレースホルダの無い骨組み。
//
// 取った値には、取ったときの `finishedTurnCount` を添えて持つ（持ち越しの間は、前の値と一緒に前の数を出す）。

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

import {
  type PlanUsageReport,
  UNAVAILABLE_PLAN_USAGE,
} from "../../../../../shared/usage/plan-usage.ts"
import { rpc } from "../../../../domain/rpc.ts"
import type { PlanUsageState } from "../domain/plan-window.ts"
import type { UsageSource } from "../domain/usage-source.ts"

export type UsePlanUsageResult = {
  readonly state: PlanUsageState
  readonly source: UsageSource
  /** いま取り直し中か（`query.isFetching`）。ボタンの無効化・回転・値を薄く見せるのに使う。 */
  readonly fetching: boolean
  /** 再読み込みを押したときに呼ぶ。出どころへ取りに行き直す（最後の値を出し直すのではない）。 */
  readonly retry: () => void
}

type FetchedPlanUsage = {
  readonly report: PlanUsageReport
  readonly finishedTurnCount: number
}

/**
 * 「該当しない」が返った間の取り直しの間隔（ミリ秒）。起動直後は claude が契約の種類をまだ持たず、
 * 「該当しない」を返すことがあるため、値が出るまで間隔を延ばして取り直す。
 */
const NOT_APPLICABLE_RETRY_DELAYS_MS = [2_000, 5_000, 10_000, 20_000] as const

/** `finishedTurnCount` が変わるたびに取り直す。マウント時にも1回引く（`staleTime: 0`）。 */
export function usePlanUsage(finishedTurnCount: number): UsePlanUsageResult {
  const [manualRetryKey, setManualRetryKey] = useState<number | undefined>(undefined)
  const seriesAllowed = manualRetryKey !== finishedTurnCount
  const client = useQueryClient()
  // 合図を鍵に足す（値が変われば別のクエリとして引き直す）。
  const queryKey = [...rpc.planUsage.report.queryKey(), finishedTurnCount]
  const query = useQuery({
    queryKey,
    queryFn: async ({ signal }): Promise<FetchedPlanUsage> => ({
      report: await rpc.planUsage.report.call(undefined, { signal }),
      finishedTurnCount,
    }),
    staleTime: 0,
    // 落ちた応答は再試行せず、すぐ「取れない」に倒す。
    retry: false,
    placeholderData: keepPreviousData,
    refetchInterval: (current) => {
      if (
        !seriesAllowed ||
        current.state.status === "error" ||
        current.state.data?.report.kind !== "not-applicable"
      ) {
        return false
      }
      return NOT_APPLICABLE_RETRY_DELAYS_MS[current.state.dataUpdateCount - 1] ?? false
    },
  })
  // 「該当しない」を最終結果にするのは、列を使い切った（または列を始めない）回だけ。
  // それまでの合間は、取り直しの最中でなくても取得中に見せる。
  const updateCount = client.getQueryState(queryKey)?.dataUpdateCount ?? 0
  const waiting =
    !query.isError &&
    query.data?.report.kind === "not-applicable" &&
    (query.isPlaceholderData || (seriesAllowed && !isRetrySeriesExhausted(updateCount)))
  return {
    state: toState(
      query.isPending || waiting,
      query.data?.report ?? UNAVAILABLE_PLAN_USAGE,
      query.dataUpdatedAt,
    ),
    source:
      query.data === undefined
        ? toSourceWithoutData(query.isPending, finishedTurnCount)
        : { kind: "after", finishedTurnCount: query.data.finishedTurnCount },
    fetching: query.isFetching || waiting,
    retry: () => {
      setManualRetryKey(finishedTurnCount)
      void query.refetch()
    },
  }
}

/** 取り直しの列を使い切ったか（`updateCount` は最初の取得も数える）。 */
function isRetrySeriesExhausted(updateCount: number): boolean {
  return updateCount > NOT_APPLICABLE_RETRY_DELAYS_MS.length
}

/** 取れるのを待っている間は骨組み、届いていれば結果を描く形に畳む。 */
function toState(
  isWaiting: boolean,
  report: PlanUsageReport,
  dataUpdatedAt: number,
): PlanUsageState {
  if (isWaiting) {
    return { kind: "pending" }
  }
  return toReportState(report, dataUpdatedAt)
}

/** 値が無いまま失敗した回は、いまの数で取りに行って「取れない」を出している。 */
function toSourceWithoutData(isPending: boolean, finishedTurnCount: number): UsageSource {
  return isPending ? { kind: "none" } : { kind: "after", finishedTurnCount }
}

/** 届いた結果を描く形に畳む。`dataUpdatedAt` は一度も成功していなければ `0`——番兵として使う。 */
function toReportState(report: PlanUsageReport, dataUpdatedAt: number): PlanUsageState {
  const takenAt = dataUpdatedAt === 0 ? undefined : dataUpdatedAt
  if (report.kind === "ready") {
    // ready はここでしか出ない経路なので takenAt は必ずある（0 は現実には起きない値）。
    return {
      kind: "ready",
      usage: report.usage,
      takenAt: takenAt ?? dataUpdatedAt,
    }
  }
  return { kind: "unavailable", takenAt }
}
