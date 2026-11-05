// 灯りの暦が取りに行く応答の型と、暦の範囲・灯りの段階の判定。
// 運ぶのは日付と数だけで、課題の題も会話の文面も入れない。

import { z } from "zod"

import { dateKeyOfPlainDate, dateKeySchema, type DateKey } from "../diary/date-key.ts"

/** 暦の1マス。`count` はその日に閉じた Beads の課題の数。 */
export type AchievementCalendarDay = {
  readonly date: DateKey
  readonly count: number
}

/**
 * 暦の手続きの応答（見る範囲は常に「今日を含む直近5週」で、日付は選べない）。
 * Beads が読めない（`.beads` が無い・`bd` が無い）ときは画面ごと `unknown`。
 */
export type AchievementCalendar =
  | { readonly kind: "unknown" }
  | {
      readonly kind: "known"
      /** サーバのローカル時刻の今日（`YYYY-MM-DD`）。ブラウザは時計を読まない。 */
      readonly today: DateKey
      /** 暦の範囲ぶん（{@link achievementCalendarDateKeys}）、日付の古い順。 */
      readonly days: readonly AchievementCalendarDay[]
      /** 日記のある日のすべて（新しい順。暦の5週に限らない。日記の保存が無ければ空）。 */
      readonly diaryDates: readonly DateKey[]
    }

const achievementCalendarDaySchema = z.object({
  date: dateKeySchema,
  count: z.number(),
})

/** 配る形そのもの。 */
export const achievementCalendarSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("unknown") }),
  z.object({
    kind: z.literal("known"),
    today: dateKeySchema,
    days: z.array(achievementCalendarDaySchema).readonly(),
    diaryDates: z.array(dateKeySchema).readonly(),
  }),
]) satisfies z.ZodType<AchievementCalendar>

/**
 * 暦の範囲。「今日を含む週の月曜から4週前の月曜」〜今日を、日付キーの古い順で返す。
 * 今日より後は含まない（ブラウザが並べるだけで数は無い）。
 */
export function achievementCalendarDateKeys(today: DateKey): readonly DateKey[] {
  const todayDate = Temporal.PlainDate.from(today)
  const mondayOfThisWeek = todayDate.subtract({ days: todayDate.dayOfWeek - 1 })
  const start = mondayOfThisWeek.subtract({ weeks: 4 })

  const dateKeys: DateKey[] = []
  for (
    let cursor = start;
    Temporal.PlainDate.compare(cursor, todayDate) <= 0;
    cursor = cursor.add({ days: 1 })
  ) {
    dateKeys.push(dateKeyOfPlainDate(cursor))
  }
  return dateKeys
}

export type LampLevel = "none" | "faint" | "lit" | "bright"

/** 段階の区切り。多いほうから並べ、最初に当てはまったものを採る。 */
const LAMP_LEVEL_THRESHOLDS = [
  { min: 40, level: "bright" },
  { min: 10, level: "lit" },
  { min: 1, level: "faint" },
  { min: 0, level: "none" },
] as const satisfies readonly { readonly min: number; readonly level: LampLevel }[]

/** その日に閉じた課題の数から灯りの段階を決める。 */
export function lampLevel(count: number): LampLevel {
  const matched = LAMP_LEVEL_THRESHOLDS.find((threshold) => count >= threshold.min)
  return matched === undefined ? "none" : matched.level
}
