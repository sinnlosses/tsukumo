// 利用枠を取りに行き、サイドバーの札（`PlanUsageRow`）が算出せずにそのまま描ける形へ畳む。
// 取り直す契機は開いたとき・ターンが終わるたび・再読み込みのボタン。
// 「いつ取り直すか」は自分では決めず、`finishedTurnCount` を呼び出し側から受け取り、値が変われば取り直す。
// ボタンからの取り直しだけは鍵を変えずに `retry()`（`query.refetch()`）で行う。
//
// 前の値を残したまま取り直す（`placeholderData: keepPreviousData`）。
// 見本（`QUOTA-Sidebar.dc.html`「3a 取得中（前の値あり）」）が前の値を薄く残すことを求めている。
// 鍵が変わるクエリは既定では骨組みに戻るので、前の成功結果をプレースホルダとして持ち越して、ボタンでの取り直しと同じ見え方に揃える。
// 「まだ一度も取れていない」（`query.isPending`）だけがプレースホルダの無い骨組み。
//
// 取った値には、取ったときの `finishedTurnCount` を添えて持つ（持ち越しの間は、前の値と一緒に前の数を出す）。

import { keepPreviousData, useQuery } from "@tanstack/react-query"

import {
  type PlanUsageReport,
  UNAVAILABLE_PLAN_USAGE,
} from "../../../../../shared/plan-usage/plan-usage.ts"
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

/** `finishedTurnCount` が変わるたびに取り直す。マウント時にも1回引く（`staleTime: 0`）。 */
export function usePlanUsage(finishedTurnCount: number): UsePlanUsageResult {
  const query = useQuery({
    // 合図を鍵に足す（値が変われば別のクエリとして引き直す）。
    queryKey: [...rpc.planUsage.report.queryKey(), finishedTurnCount],
    queryFn: async ({ signal }): Promise<FetchedPlanUsage> => ({
      report: await rpc.planUsage.report.call(undefined, { signal }),
      finishedTurnCount,
    }),
    staleTime: 0,
    // 落ちた応答は再試行せず、すぐ「取れない」に倒す。
    retry: false,
    placeholderData: keepPreviousData,
  })
  return {
    state: toState(query.isPending, query.data?.report, query.dataUpdatedAt),
    source: toSource(query.isPending, query.data, finishedTurnCount),
    fetching: query.isFetching,
    retry: () => void query.refetch(),
  }
}

/** まだ一度も取れていなければ骨組み、届いていれば結果を描く形に畳む。 */
function toState(
  isPending: boolean,
  data: PlanUsageReport | undefined,
  dataUpdatedAt: number,
): PlanUsageState {
  if (isPending) {
    return { kind: "pending" }
  }
  return toReportState(data ?? UNAVAILABLE_PLAN_USAGE, dataUpdatedAt)
}

/** 値が無いまま失敗した回は、いまの数で取りに行って「取れない」を出している。 */
function toSource(
  isPending: boolean,
  data: FetchedPlanUsage | undefined,
  finishedTurnCount: number,
): UsageSource {
  if (data !== undefined) {
    return { kind: "after", finishedTurnCount: data.finishedTurnCount }
  }
  return isPending ? { kind: "none" } : { kind: "after", finishedTurnCount }
}

/** 届いた結果を描く形に畳む。`dataUpdatedAt` は一度も成功していなければ `0`——番兵として使う。 */
function toReportState(report: PlanUsageReport, dataUpdatedAt: number): PlanUsageState {
  const takenAt = dataUpdatedAt === 0 ? undefined : dataUpdatedAt
  if (report.kind === "ready") {
    // ready はここでしか出ない経路なので takenAt は必ずある（0 は現実には起きない値）。
    return { kind: "ready", usage: report.usage, takenAt: takenAt ?? dataUpdatedAt }
  }
  if (report.kind === "not-applicable") {
    return { kind: "not-applicable" }
  }
  return { kind: "unavailable", takenAt }
}
