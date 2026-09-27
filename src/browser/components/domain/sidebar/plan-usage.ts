// 利用枠（`docs/glossary.md`「利用枠」）を取りに行き、サイドバーの札（`PlanUsageRow`）が
// 算出せずにそのまま描ける形へ畳む。読み手はサイドバーの札1つだけなので `browser/domain/` へは
// 上げず、この機能の中に置く（`docs/design.md`「上げる引き金は「2つ目の読み手が
// 出たとき」」）。取り直す契機は開いたとき・ターンが終わるたび・再読み込みのボタン
// （`docs/screen-design.md`「使用量の行」）。「いつ取り直すか」を自分では決めないのは
// `useContextUsage` と同じ理由——`refetchKey` を呼び出し側から受け取り、値が
// 変われば取り直す。ボタンからの取り直しだけは鍵を変えずに `retry()`（`query.refetch()`）で行う。
//
// 前の値を残したまま取り直す（`placeholderData: keepPreviousData`）。コンテキストの内訳は
// 取り直すたびに骨組みへ戻すが、利用枠の札は見本（`QUOTA-Sidebar.dc.html`「3a 取得中
// （前の値あり）」）が前の値を薄く残すことを求めている——`refetchKey` が変わっても（鍵が変わる
// クエリは既定では骨組みに戻る）前の成功結果をプレースホルダとして持ち越すことで、ボタンでの
// 取り直しと同じ見え方に揃えられる。「まだ一度も取れていない」（`query.isPending`）だけが
// プレースホルダの無い骨組み。

import { keepPreviousData, useQuery } from "@tanstack/react-query"

import {
  type PlanUsage,
  type PlanUsageReport,
  UNAVAILABLE_PLAN_USAGE,
} from "../../../../shared/plan-usage/plan-usage.ts"
import { rpc } from "../../../domain/rpc.ts"

/**
 * 描くために要る形。`pending` はまだ一度も取れていないときだけの骨組み用
 * （`fetching` は常に `true`）。`unavailable` の `takenAt` は「最後に失敗した時刻」で、
 * まだ一度も応答が届いていなければ `undefined`。
 */
export type PlanUsageState =
  | { readonly kind: "pending" }
  | { readonly kind: "ready"; readonly usage: PlanUsage; readonly takenAt: number }
  | { readonly kind: "unavailable"; readonly takenAt: number | undefined }
  | { readonly kind: "not-applicable" }

export type UsePlanUsageResult = {
  readonly state: PlanUsageState
  /** いま取り直し中か（`query.isFetching`）。ボタンの無効化・回転・値を薄く見せるのに使う。 */
  readonly fetching: boolean
  /** 再読み込みを押したときに呼ぶ。出どころへ取りに行き直す（最後の値を出し直すのではない）。 */
  readonly retry: () => void
}

/**
 * `state.lastTurnFinishedAt` から、利用枠を取り直す合図を作る。ターンが終わるたびに違う値に
 * なる（コンテキストの内訳が同じ値から作る合図と同じ考え方——「無い」はここで `0` に畳む）。
 */
export function planUsageRefetchKey(lastTurnFinishedAt: number | undefined): number {
  return lastTurnFinishedAt ?? 0
}

/**
 * `refetchKey` が変わるたびに取り直す。マウント時にも1回引く（`staleTime: 0`）。
 */
export function usePlanUsage(refetchKey: number): UsePlanUsageResult {
  const query = useQuery(
    rpc.planUsage.report.queryOptions({
      // 合図を鍵に足す（値が変われば別のクエリとして引き直す。コンテキストの内訳の取得と同じ形）。
      queryKey: [...rpc.planUsage.report.queryKey(), refetchKey],
      staleTime: 0,
      // 落ちた応答は再試行せず、すぐ「取れない」に倒す。
      retry: false,
      placeholderData: keepPreviousData,
    }),
  )
  return {
    state: toState(query.isPending, query.data, query.dataUpdatedAt),
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
