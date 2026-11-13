// 部屋の頭の下の「今日の灯り」のロジック。今週7日（月曜はじまり）の灯りの段階と、今日終えたタスクの数を、見た目が受け取れる形まで畳んで返す。
//
// 数は成果の暦と同じ手続きから読む。タスクを終えた（終えたタスクの数が変わった）ときは取り直しを頼む。
// 「＋1」は、依頼を待っている間に見た今日の数を基準にして、それより増えているあいだ出す。

import { useRef, useState } from "react"

import {
  lampLevel,
  type LampLevel,
} from "../../../../../shared/achievement/achievement-calendar.ts"
import type { DateKey } from "../../../../../shared/diary/date-key.ts"
import { dateKeyOfPlainDate } from "../../../../../shared/diary/date-key.ts"
import { hasTaskStatus } from "../../../../../shared/repository/task-summary.ts"
import { conversationMoment } from "../../../../../shared/session/conversation-moment.ts"
import { invalidateAchievement } from "../../../../domain/achievement-cache.ts"
import { useAchievementCalendarQuery } from "../../../../domain/achievement-calendar-query.ts"
import { useExternalSync } from "../../../../hooks/use-external-sync.ts"
import { rpc } from "../../../../stores/rpc.ts"
import { useScreenHref } from "../../../../stores/screen.tsx"
import { useSession } from "../../../../stores/session.ts"

const WEEKDAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"] as const

export type TodayLampDay = {
  readonly key: DateKey
  readonly weekday: string
  readonly level: LampLevel
  readonly isToday: boolean
}

/** 数が読めないあいだ（届く前・取れなかった）は `hidden` で、何も出さない。 */
export type TodayLampView =
  | { readonly kind: "hidden" }
  | {
      readonly kind: "shown"
      readonly days: readonly TodayLampDay[]
      readonly todayCount: number
      /** 依頼を待っていた間より今日の数が増えているか。 */
      readonly plus: boolean
      /** 押すと開く成果の紙。 */
      readonly href: string
    }

export function useTodayLamp(): TodayLampView {
  const calendar = useAchievementCalendarQuery(rpc.achievement.calendar)
  const screenHref = useScreenHref()
  const waiting = useSession((session) => conversationMoment(session.state) === "greet")
  const closedCount = useSession((session) =>
    session.state.tasks.kind === "known"
      ? session.state.tasks.items.filter((task) => hasTaskStatus(task, "done")).length
      : 0,
  )
  // 依頼を待っている間の今日の数を基準に持つ（描画中の取り込み）。
  const [baseline, setBaseline] = useState<
    { readonly kind: "unseen" } | { readonly kind: "seen"; readonly count: number }
  >({ kind: "unseen" })

  // マウント時は暦の取得が自分で取りに行くので、見た数より増えたときだけ頼む。
  const seenClosedCount = useRef(closedCount)
  useExternalSync(() => {
    if (closedCount > seenClosedCount.current) {
      invalidateAchievement(rpc.achievement)
    }
    seenClosedCount.current = closedCount
  }, [closedCount])

  if (calendar.kind !== "known") {
    return { kind: "hidden" }
  }
  const todayCount = calendar.days.find((day) => day.date === calendar.today)?.count ?? 0
  if (waiting && !(baseline.kind === "seen" && baseline.count === todayCount)) {
    setBaseline({ kind: "seen", count: todayCount })
  }
  return {
    kind: "shown",
    days: weekDays(calendar),
    todayCount,
    plus: baseline.kind === "seen" && todayCount > baseline.count,
    href: screenHref("achievement"),
  }
}

function weekDays(calendar: {
  readonly today: DateKey
  readonly days: readonly { readonly date: DateKey; readonly count: number }[]
}): readonly TodayLampDay[] {
  const today = Temporal.PlainDate.from(calendar.today)
  const monday = today.subtract({ days: today.dayOfWeek - 1 })
  const countOf = new Map(calendar.days.map((day) => [day.date, day.count] as const))
  return WEEKDAY_LABELS.map((weekday, index) => {
    const key = dateKeyOfPlainDate(monday.add({ days: index }))
    return {
      key,
      weekday,
      level: key > calendar.today ? "none" : lampLevel(countOf.get(key) ?? 0),
      isToday: key === calendar.today,
    }
  })
}
