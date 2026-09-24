// 灯りの暦（`docs/glossary.md`「灯りの暦」）が取りに行く応答の型と、経路の名前。
// `src/shared/achievement.ts` の1日ぶんとは別経路（`GET /achievement-calendar`）。
// 数え方・範囲・灯りの段階の規則は `docs/requirements.md` 4.11「灯りの段階」が正典で、ここは
// 受け渡しの形と、届いた値の読み取り、暦の範囲・灯りの段階の判定だけを持つ
// （`docs/design.md`「成果の集め方と配り方」）。
//
// **運ぶのは日付とコミットの数だけ**（コミットの件名も会話の文面も入らない。
// `docs/coding-standards.md`「会話内容の扱い」）。

import { z } from "zod"

/** 暦の経路（`GET /achievement-calendar?t=<起動トークン>`）。クエリは起動トークンだけ
 * （見る範囲は常に「今日を含む直近5週」で、日付は選べない）。 */
export const ACHIEVEMENT_CALENDAR_PATH = "/achievement-calendar"

/** 暦の1マス。 */
export type AchievementCalendarDay = {
  readonly date: string
  readonly commitCount: number
}

/**
 * `GET /achievement-calendar` の応答。`main` が読めない（git リポジトリでない・`main` ブランチが
 * 無い・`git` が無い）ときは画面ごと `unknown`。
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

/** 読めない・配られない形は「取れなかった」に倒す既定値。 */
export const UNKNOWN_ACHIEVEMENT_CALENDAR = { kind: "unknown" } satisfies AchievementCalendar

const achievementCalendarDaySchema = z.object({
  date: z.string(),
  commitCount: z.number(),
})

const achievementCalendarSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("unknown") }),
  z.object({
    kind: z.literal("known"),
    today: z.string(),
    days: z.array(achievementCalendarDaySchema),
    diaryDates: z.array(z.string()),
  }),
])

/**
 * 届いた JSON を {@link AchievementCalendar} として読む。**読めない形のときは「取れなかった」**
 * （`readDailyAchievement` と同じ割り切り）。
 */
export function readAchievementCalendar(value: unknown): AchievementCalendar {
  const parsed = achievementCalendarSchema.safeParse(value)
  return parsed.success ? parsed.data : UNKNOWN_ACHIEVEMENT_CALENDAR
}

/**
 * 暦の範囲（`docs/requirements.md` 4.11「灯りの段階」・`docs/design.md`「成果の集め方と配り方」）。
 * **「今日を含む週の月曜から4週前の月曜」〜今日**を、日付キーの古い順で返す（今日より後は含まない
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

/** 段階の区切り（`docs/requirements.md` 4.11「灯りの段階」の表。**多いほうから**並べ、
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
