// 成果の画面（`docs/screen-design.md` 13.10）が取りに行く応答の型と、経路の名前。**両側
// （サーバとブラウザ）が同じ値を見る**ので shared に置く（`token-usage-summary.ts` と同じ考え方）。
// 数え方の規則そのものは `docs/requirements.md` 4.11 が正典で、ここは受け渡しの形と、届いた値の
// 読み取りだけを持つ（`docs/design.md` 5章「成果の集め方と配り方」）。語は
// `docs/glossary.md`「成果」。
//
// **運ぶのはコミットの数とタスクの ID・summary だけ**（コミットの件名も会話の文面も入らない。
// `docs/coding-standards.md`「会話内容の扱い」）。

import { z } from "zod"

/** 成果の経路（`GET /achievement?t=<起動トークン>&date=<日付キー>`）。 */
export const ACHIEVEMENT_PATH = "/achievement"

/** 見る日を載せるクエリの名前（`YYYY-MM-DD`）。 */
export const ACHIEVEMENT_DATE_QUERY_NAME = "date"

/**
 * 終えたタスク1件（ID と、画面・依頼に出す要約）。
 */
export type AchievementTask = {
  readonly id: string
  readonly summary: string
}

/**
 * その日に終えたタスクの一覧。**タスクの記録がどちらの形式も無いリポジトリ**（tsukumo を
 * ほかのプロジェクトで起こしたとき）では `unknown`——コミットの数だけは出す
 * （`docs/requirements.md` 4.11）。
 */
export type AchievementDoneTasks =
  | { readonly kind: "unknown" }
  | { readonly kind: "known"; readonly items: readonly AchievementTask[] }

/**
 * `GET /achievement` の応答。`main` が読めない（git リポジトリでない・`main` ブランチが無い・
 * `git` が無い）ときは画面ごと `unknown`。
 */
export type DailyAchievement =
  | { readonly kind: "unknown" }
  | {
      readonly kind: "known"
      /** 見た日（`YYYY-MM-DD`）。クエリが無い・読めない・今日より先なら今日に倒した結果。 */
      readonly date: string
      /** サーバのローカル時刻の今日（`YYYY-MM-DD`）。ブラウザは時計を読まない。 */
      readonly today: string
      readonly commitCount: number
      readonly doneTasks: AchievementDoneTasks
    }

/** 読めない・配られない形は「取れなかった」に倒す既定値。 */
export const UNKNOWN_ACHIEVEMENT = { kind: "unknown" } satisfies DailyAchievement

const achievementTaskSchema = z.object({ id: z.string(), summary: z.string() })

const achievementDoneTasksSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("unknown") }),
  z.object({ kind: z.literal("known"), items: z.array(achievementTaskSchema) }),
])

const dailyAchievementSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("unknown") }),
  z.object({
    kind: z.literal("known"),
    date: z.string(),
    today: z.string(),
    commitCount: z.number(),
    doneTasks: achievementDoneTasksSchema,
  }),
])

/**
 * 届いた JSON を {@link DailyAchievement} として読む。**読めない形のときは「取れなかった」**
 * （`readTokenUsageSummary` と同じ割り切り。画面は「不明」と同じ見た目になるだけで落ちない）。
 */
export function readDailyAchievement(value: unknown): DailyAchievement {
  const parsed = dailyAchievementSchema.safeParse(value)
  return parsed.success ? parsed.data : UNKNOWN_ACHIEVEMENT
}

/** 前の日の日付キー（`Temporal.PlainDate` の引き算。時計は読まない）。 */
export function previousDateKey(dateKey: string): string {
  return Temporal.PlainDate.from(dateKey).subtract({ days: 1 }).toString()
}

/** 次の日の日付キー（`Temporal.PlainDate` の足し算。時計は読まない）。 */
export function nextDateKey(dateKey: string): string {
  return Temporal.PlainDate.from(dateKey).add({ days: 1 }).toString()
}

/**
 * クエリの `date` を見る日として読む。**無い・`YYYY-MM-DD` に読めない・`today` より先のときは
 * `today` に倒す**（`readTokenUsageDays` と同じく、呼ぶ側が書き間違えても画面は出る。
 * `docs/requirements.md` 4.11）。「今日」を決めるのは呼ぶ側（サーバのローカル時刻）で、ここは
 * 比べるだけ。
 */
export function resolveAchievementDateKey(raw: string | undefined, today: string): string {
  if (raw === undefined) {
    return today
  }
  const date = dateKeyOf(raw)
  if (date === undefined) {
    return today
  }
  return date.toString() > today ? today : date.toString()
}

/** `YYYY-MM-DD` として読めれば {@link Temporal.PlainDate}、読めなければ `undefined`。 */
function dateKeyOf(value: string): Temporal.PlainDate | undefined {
  try {
    return Temporal.PlainDate.from(value)
  } catch {
    return undefined
  }
}
