// 灯りの暦の取得。
// 手続き `achievement.calendar` は常に「今日を含む直近5週」を配るので、見ている日とは独立に1回だけ取りに行く。
//
// 取り直す契機は、開いたとき・窓にフォーカスが戻ったとき（`staleTime: 0` と React Query の既定の `refetchOnWindowFocus`）・60秒ごと（常に今日が範囲に入るので無条件）・日記が書き上がったとき（`useAchievement` が無効化する）。

import { useQuery } from "@tanstack/react-query"

import {
  lampLevel,
  type AchievementCalendar,
  type LampLevel,
} from "../../../../../shared/achievement/achievement-calendar.ts"
import { rpc } from "../../../../domain/rpc.ts"
import { monthDayLabel } from "../../../../utils/month-day-label.ts"
import { LAMP_LABEL } from "../domain/lamp-label.ts"

const REFETCH_INTERVAL_MS = 60_000

/** 暦のマス1つ。今日より後は押せない日付だけ。 */
export type CalendarCell =
  | { readonly kind: "future"; readonly key: string; readonly dateLabel: string }
  | {
      readonly kind: "day"
      readonly key: string
      readonly date: string
      readonly dateLabel: string
      readonly level: LampLevel
      readonly hasDiary: boolean
      readonly isToday: boolean
      readonly ariaLabel: string
    }

/**
 * まだ一度も届いていない間は `loading`（初回だけ「取れなかった」と誤読させないための区別）。
 * 届けば `AchievementCalendar` の中身に、マスの並びと範囲の字を足したもの。
 * `unknown` は「main が読めない」と「取りに行って失敗した」の両方をここで畳む。
 */
export type AchievementCalendarView =
  | { readonly kind: "loading" }
  | { readonly kind: "unknown" }
  | (Extract<AchievementCalendar, { readonly kind: "known" }> & {
      readonly cells: readonly CalendarCell[]
      readonly rangeLabel: string
    })

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
  const calendar = query.data
  if (calendar === undefined || calendar.kind === "unknown") {
    return { kind: "unknown" }
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
  dateKeys: readonly string[],
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
function fullCalendarDateKeys(today: string): readonly string[] {
  const todayDate = Temporal.PlainDate.from(today)
  const mondayOfThisWeek = todayDate.subtract({ days: todayDate.dayOfWeek - 1 })
  const start = mondayOfThisWeek.subtract({ weeks: 4 })
  return Array.from({ length: 35 }, (_, index) => start.add({ days: index }).toString())
}
