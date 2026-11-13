// 灯りの暦の取得と、暦のマスの並びへの畳み込み。取りに行く側は `useAchievementCalendarQuery`。

import {
  lampLevel,
  type AchievementCalendar,
  type LampLevel,
} from "../../../../../shared/achievement/achievement-calendar.ts"
import { dateKeyOfPlainDate, type DateKey } from "../../../../../shared/diary/date-key.ts"
import { monthDayLabel } from "../../../../../shared/utils/month-day-label.ts"
import { useAchievementCalendarQuery } from "../../../../domain/achievement-calendar-query.ts"
import { rpc } from "../../../../stores/rpc.ts"
import { LAMP_LABEL } from "../domain/lamp-label.ts"

/** 暦のマス1つ。今日より後は押せない日付だけ。 */
export type CalendarCell =
  | { readonly kind: "future"; readonly key: string; readonly dateLabel: string }
  | {
      readonly kind: "day"
      readonly key: string
      readonly date: DateKey
      readonly dateLabel: string
      readonly level: LampLevel
      readonly hasDiary: boolean
      readonly isToday: boolean
      readonly ariaLabel: string
    }

/**
 * まだ一度も届いていない間は `loading`（初回だけ「取れなかった」と誤読させないための区別）。
 * 届けば `AchievementCalendar` の中身に、マスの並びと範囲の字を足したもの。
 * `unknown` は「Beads が読めない」と「取りに行って失敗した」の両方をここで畳む。
 */
export type AchievementCalendarView =
  | { readonly kind: "loading" }
  | { readonly kind: "unknown" }
  | (Extract<AchievementCalendar, { readonly kind: "known" }> & {
      readonly cells: readonly CalendarCell[]
      readonly rangeLabel: string
    })

export function useAchievementCalendar(): AchievementCalendarView {
  const calendar = useAchievementCalendarQuery(rpc.achievement.calendar)
  if (calendar.kind !== "known") {
    return calendar
  }
  const dateKeys = fullCalendarDateKeys(calendar.today)
  const first = dateKeys[0]
  const last = dateKeys.at(-1)
  return {
    ...calendar,
    cells: cellsOf(calendar, dateKeys),
    rangeLabel:
      first === undefined || last === undefined
        ? ""
        : `${monthDayLabel(Temporal.PlainDate.from(first))}〜${monthDayLabel(Temporal.PlainDate.from(last))}`,
  }
}

function cellsOf(
  calendar: Extract<AchievementCalendar, { readonly kind: "known" }>,
  dateKeys: readonly DateKey[],
): readonly CalendarCell[] {
  const dayOf = new Map(calendar.days.map((day) => [day.date, day] as const))
  const diaryDates = new Set(calendar.diaryDates)

  return dateKeys.map((date, index): CalendarCell => {
    const dateLabel = cellDateLabel(date, index)
    if (date > calendar.today) {
      return { kind: "future", key: date, dateLabel }
    }
    const level = lampLevel(dayOf.get(date)?.count ?? 0)
    const hasDiary = diaryDates.has(date)
    return {
      kind: "day",
      key: date,
      date,
      dateLabel,
      level,
      hasDiary,
      isToday: date === calendar.today,
      ariaLabel: `${monthDayLabel(Temporal.PlainDate.from(date))} 灯り ${LAMP_LABEL[level]}${hasDiary ? "・日記あり" : ""}`,
    }
  })
}

/** マスの左上の日付。月の初日と最初のマスだけ「9/1」の形、ほかは日だけ。 */
function cellDateLabel(date: string, index: number): string {
  const parsed = Temporal.PlainDate.from(date)
  return parsed.day === 1 || index === 0
    ? `${String(parsed.month)}/${String(parsed.day)}`
    : String(parsed.day)
}

/**
 * マスの並びぶん（月曜はじまりの7列×5段＝35日）の日付キー、古い順。
 * 開始日は `achievementCalendarDateKeys` と揃えて「今日を含む週の月曜から4週前の月曜」にする。
 * そちらは今日より後を返さないので、表示の枠を埋める残りの曜日はここで別に数える。
 */
function fullCalendarDateKeys(today: DateKey): readonly DateKey[] {
  const todayDate = Temporal.PlainDate.from(today)
  const mondayOfThisWeek = todayDate.subtract({ days: todayDate.dayOfWeek - 1 })
  const start = mondayOfThisWeek.subtract({ weeks: 4 })
  return Array.from({ length: 35 }, (_, index) => dateKeyOfPlainDate(start.add({ days: index })))
}
