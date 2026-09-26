// 灯りの暦（`docs/glossary.md`「灯りの暦」）が取りに行く応答の型。`src/shared/achievement.ts` の
// 1日ぶんとは別の手続き（`src/shared/contract/achievement.ts` の `calendar`）。
// 数え方・範囲・灯りの段階の規則は `docs/requirements.md` 4.11「灯りの段階」が正典で、ここは
// 受け渡しの形と、暦の範囲・灯りの段階の判定だけを持つ
// （`docs/design.md`「成果の集め方と配り方」）。
//
// 運ぶのは日付とコミットの数だけ（コミットの件名も会話の文面も入らない。
// `docs/coding-standards.md`「会話内容の扱い」）。

import { z } from "zod"

/** 暦の1マス。 */
export type AchievementCalendarDay = {
  readonly date: string
  readonly commitCount: number
}

/**
 * 暦の手続きの応答（見る範囲は常に「今日を含む直近5週」で、日付は選べない）。`main` が読めない
 * （git リポジトリでない・`main` ブランチが無い・`git` が無い）ときは画面ごと `unknown`。
 */
export type AchievementCalendar =
  | { readonly kind: "unknown" }
  | {
      readonly kind: "known"
      /** サーバのローカル時刻の今日（`YYYY-MM-DD`）。ブラウザは時計を読まない。 */
      readonly today: string
      /** 暦の範囲ぶん（{@link achievementCalendarDateKeys}）、日付の古い順。 */
      readonly days: readonly AchievementCalendarDay[]
      /** 日記のある日のすべて（新しい順。暦の5週に限らない。日記の保存が無ければ空）。 */
      readonly diaryDates: readonly string[]
    }

const achievementCalendarDaySchema = z.object({
  date: z.string(),
  commitCount: z.number(),
})

/** 配る形そのもの（{@link AchievementCalendar} と同じ鍵）。 */
export const achievementCalendarSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("unknown") }),
  z.object({
    kind: z.literal("known"),
    today: z.string(),
    days: z.array(achievementCalendarDaySchema).readonly(),
    diaryDates: z.array(z.string()).readonly(),
  }),
])

/**
 * 暦の範囲（`docs/requirements.md` 4.11「灯りの段階」・`docs/design.md`「成果の集め方と配り方」）。
 * 「今日を含む週の月曜から4週前の月曜」〜今日を、日付キーの古い順で返す（今日より後は含まない
 * ——ブラウザが並べるだけで数は無い）。
 */
export function achievementCalendarDateKeys(today: string): readonly string[] {
  const todayDate = Temporal.PlainDate.from(today)
  const mondayOfThisWeek = todayDate.subtract({ days: todayDate.dayOfWeek - 1 })
  const start = mondayOfThisWeek.subtract({ weeks: 4 })

  const dateKeys: string[] = []
  for (
    let cursor = start;
    Temporal.PlainDate.compare(cursor, todayDate) <= 0;
    cursor = cursor.add({ days: 1 })
  ) {
    dateKeys.push(cursor.toString())
  }
  return dateKeys
}

/** 灯りの段階（`docs/requirements.md` 4.11「灯りの段階」）。 */
export type LampLevel = "none" | "faint" | "lit" | "bright"

/** 段階の区切り（`docs/requirements.md` 4.11「灯りの段階」の表。多いほうから並べ、
 * 最初に当てはまったものを採る）。 */
const LAMP_LEVEL_THRESHOLDS = [
  { min: 40, level: "bright" },
  { min: 10, level: "lit" },
  { min: 1, level: "faint" },
  { min: 0, level: "none" },
] as const satisfies readonly { readonly min: number; readonly level: LampLevel }[]

/** その日のコミットの数から灯りの段階を決める（`docs/requirements.md` 4.11「灯りの段階」）。 */
export function lampLevel(commitCount: number): LampLevel {
  const matched = LAMP_LEVEL_THRESHOLDS.find((threshold) => commitCount >= threshold.min)
  return matched === undefined ? "none" : matched.level
}
