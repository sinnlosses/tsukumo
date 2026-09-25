// 灯りの暦（`docs/screen-design.md` 13.10「灯りの暦」）の取得。手続き `achievement.calendar` は
// 常に「今日を含む直近5週」を配るので、見ている日（`use-achievement.ts`）とは独立に1回だけ
// 取りに行く。
//
// **取り直す契機**（`docs/design.md`「成果の集め方と配り方」）: 開いたとき・窓にフォーカスが
// 戻ったとき（`staleTime: 0` と React Query の既定の `refetchOnWindowFocus`）・60秒ごと（常に
// 今日が範囲に入るため、`use-achievement.ts` の「今日を見ているあいだだけ」と違って無条件）・
// 日記が書き上がったとき（`use-achievement.ts` が `queryClient.invalidateQueries` で無効化する）。

import { useQuery } from "@tanstack/react-query"

import { type AchievementCalendar } from "../../../../../shared/achievement-calendar.ts"
import { rpc } from "../../../../lib/rpc-client.ts"

const REFETCH_INTERVAL_MS = 60_000

/** まだ一度も届いていない間は `loading`（13.10 の表には無いが、初回だけ「取れなかった」と
 * 誤読させないための区別。届けば `AchievementCalendar` の中身がそのまま「取れなかった」も
 * 兼ねる——`unknown` は「main が読めない」と「取りに行って失敗した」の両方をここで畳む。同節
 * 「取れなかったとき」はどちらも同じ1行でよいと決めている）。 */
export type AchievementCalendarView = { readonly kind: "loading" } | AchievementCalendar

export function useAchievementCalendar(): AchievementCalendarView {
  const query = useQuery(
    rpc.achievement.calendar.queryOptions({
      staleTime: 0,
      refetchInterval: REFETCH_INTERVAL_MS,
      // 落ちた応答は再試行せず、すぐ「取れなかった」に倒す（手続きにする前と同じ）。
      retry: false,
    }),
  )

  if (query.isPending) {
    return { kind: "loading" }
  }
  // 落ちた応答（503・403）も「取れなかった」に倒す（呼び出し側は同じ扱いで足りるので、
  // `use-achievement.ts` のように `isError` を別に持ち出さない）。
  return query.data ?? { kind: "unknown" }
}
