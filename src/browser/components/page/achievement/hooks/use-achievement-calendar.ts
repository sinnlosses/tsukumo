// 灯りの暦の取得。
// 手続き `achievement.calendar` は常に「今日を含む直近5週」を配るので、見ている日とは独立に1回だけ取りに行く。
//
// 取り直す契機は、開いたとき・窓にフォーカスが戻ったとき（`staleTime: 0` と React Query の既定の `refetchOnWindowFocus`）・60秒ごと（常に今日が範囲に入るので無条件）・日記が書き上がったとき（`useAchievement` が無効化する）。

import { useQuery } from "@tanstack/react-query"

import type { AchievementCalendar } from "../../../../../shared/achievement/achievement-calendar.ts"
import { rpc } from "../../../../domain/rpc.ts"

const REFETCH_INTERVAL_MS = 60_000

/**
 * まだ一度も届いていない間は `loading`（初回だけ「取れなかった」と誤読させないための区別）。
 * 届けば `AchievementCalendar` の中身がそのまま「取れなかった」も兼ねる。
 * `unknown` は「main が読めない」と「取りに行って失敗した」の両方をここで畳む。
 */
export type AchievementCalendarView = { readonly kind: "loading" } | AchievementCalendar

export function useAchievementCalendar(): AchievementCalendarView {
  const query = useQuery(
    rpc.achievement.calendar.queryOptions({
      staleTime: 0,
      // 画面を離れている間も前回の結果を捨てない（既定の `gcTime` では5分で捨てる）。
      gcTime: Infinity,
      refetchInterval: REFETCH_INTERVAL_MS,
      // 落ちた応答は再試行せず、すぐ「取れなかった」に倒す。
      retry: false,
    }),
  )

  if (query.isPending) {
    return { kind: "loading" }
  }
  // 落ちた応答（503・403）も「取れなかった」に倒す。
  return query.data ?? { kind: "unknown" }
}
