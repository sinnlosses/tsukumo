// 成果の画面（`docs/screen-design.md` 13.10）が取りに行く応答の型と、経路の名前。**両側
// （サーバとブラウザ）が同じ値を見る**ので shared に置く（`token-usage-summary.ts` と同じ考え方）。
// 数え方の規則そのものは `docs/requirements.md` 4.11 が正典で、ここは受け渡しの形と、届いた値の
// 読み取りだけを持つ（`docs/design.md` 5章「成果の集め方と配り方」）。語は
// `docs/glossary.md`「成果」。
//
// **運ぶのはコミットの数とタスクの ID・summary だけ**（コミットの件名も会話の文面も入らない。
// `docs/coding-standards.md`「会話内容の扱い」）。

import { z } from "zod"

import { dailyDiaryStatusSchema, type DailyDiaryStatus } from "./diary.ts"

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
 * 先輩タスクの卒業1件（`docs/requirements.md` 4.11「卒業と節目」）。**登録から7日以上経っていた**
 * その日に終えたタスクだけが対象。
 */
export type AchievementGraduation = {
  readonly id: string
  readonly summary: string
  /** 登録日（`YYYY-MM-DD`）。ファイルが初めて `main` に入ったコミットの日付。 */
  readonly registeredOn: string
  /** 登録から終えた日までの日数。 */
  readonly days: number
}

/**
 * 節目1件（`docs/requirements.md` 4.11「卒業と節目」）。通算のタスクの数・コミットの数が
 * 刻みの倍数をその日にまたいだとき。1日に同じ種類を複数またいでも大きいほう1つだけ。
 */
export type AchievementMilestone =
  | { readonly kind: "task"; readonly count: number; readonly taskId: string }
  | { readonly kind: "commit"; readonly count: number; readonly time: string }

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
      /** 該当が無ければ空の並び。タスクの記録が無いリポジトリではいつも空。 */
      readonly graduations: readonly AchievementGraduation[]
      /** 該当が無ければ空の並び。タスクの記録が無いリポジトリでは節目「task」はいつも空。 */
      readonly milestones: readonly AchievementMilestone[]
      /** その日の日記の状態（`src/shared/diary.ts`）。読めなくても成果そのものは配る（`unreadable`）。 */
      readonly diary: DailyDiaryStatus
    }

/** 読めない・配られない形は「取れなかった」に倒す既定値。 */
export const UNKNOWN_ACHIEVEMENT = { kind: "unknown" } satisfies DailyAchievement

const achievementTaskSchema = z.object({ id: z.string(), summary: z.string() })

const achievementDoneTasksSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("unknown") }),
  z.object({ kind: z.literal("known"), items: z.array(achievementTaskSchema) }),
])

const achievementGraduationSchema = z.object({
  id: z.string(),
  summary: z.string(),
  registeredOn: z.string(),
  days: z.number(),
})

const achievementMilestoneSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("task"), count: z.number(), taskId: z.string() }),
  z.object({ kind: z.literal("commit"), count: z.number(), time: z.string() }),
])

const dailyAchievementSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("unknown") }),
  z.object({
    kind: z.literal("known"),
    date: z.string(),
    today: z.string(),
    commitCount: z.number(),
    doneTasks: achievementDoneTasksSchema,
    graduations: z.array(achievementGraduationSchema),
    milestones: z.array(achievementMilestoneSchema),
    diary: dailyDiaryStatusSchema,
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

/** 一覧に並べるタスクの上限（`docs/requirements.md` 4.11「振り返りの依頼」）。 */
const MAX_LISTED_REQUEST_TASKS = 20

/**
 * 空の日か（コミットも終えたタスクも0）。**終えたタスクの記録が無い（`unknown`）ときは
 * 「空」と決めない**——コミットが0でもタスクの有無が分からないため、押せなくする理由には
 * しない（`docs/screen-design.md` 13.10「コミットはあり、終えたタスクが0」の割り切りを、
 * タスクが数えられないときにも安全側へ倒す）。
 */
export function isEmptyAchievementDay(
  commitCount: number,
  doneTasks: AchievementDoneTasks,
): boolean {
  return commitCount === 0 && doneTasks.kind === "known" && doneTasks.items.length === 0
}

/**
 * 振り返りのボタンを押したときに会話へ送る依頼文（`docs/requirements.md` 4.11「振り返りの依頼」、
 * 語は `docs/glossary.md`「成果の振り返り」）。**画面に出している数だけから組み立てる**——
 * コミットの件名や会話の文面は入れない（`docs/coding-standards.md`「会話内容の扱い」）。
 */
export function achievementReflectionRequestText(params: {
  readonly date: string
  readonly today: string
  readonly commitCount: number
  readonly doneTasks: AchievementDoneTasks
  /** 該当が無ければ空の並び。 */
  readonly graduations: readonly AchievementGraduation[]
  /** 該当が無ければ空の並び。 */
  readonly milestones: readonly AchievementMilestone[]
  /** その日に既に日記があるか（続きとして書き足す1行を足す）。 */
  readonly alreadyWritten: boolean
  /** 雑談中は `report` ツールが無いので、その1行を足さない。 */
  readonly chatMode: boolean
}): string {
  const dayPhrase = achievementRequestDayPhrase(params.date, params.today)
  const taskCountClause = achievementTaskCountClause(params.doneTasks)
  const commitClause = `main に入ったコミットは ${String(params.commitCount)} 件`
  const headLine =
    taskCountClause === ""
      ? `${dayPhrase}の成果を一緒に振り返って、この日の日記を書いてほしい。${commitClause}。`
      : `${dayPhrase}の成果を一緒に振り返って、この日の日記を書いてほしい。${commitClause}、${taskCountClause}`

  const lines = [headLine]
  const taskListLines = achievementTaskListLines(params.doneTasks)
  if (taskListLines.length > 0) {
    lines.push("終えたタスク:", ...taskListLines)
  }
  const surpriseLines = achievementSurpriseLines(params.graduations, params.milestones)
  if (surpriseLines.length > 0) {
    lines.push("小さな驚き:", ...surpriseLines)
  }
  if (params.alreadyWritten) {
    lines.push("この日の日記は既にあるので、続きとして書き足す。")
  }
  const bookmarkClause =
    params.doneTasks.kind === "known" && params.doneTasks.items.length > 0
      ? "しおりには終えたタスクから1件を選び、選んだ理由を添える。"
      : "しおりは要らない。"
  lines.push(
    `日記は diary ツールで1回書いて。本文はこの日の仕事の感想とねぎらいを短く。${bookmarkClause}ファイルやログは読みに行かず、この一覧だけで書いてほしい。次にやることの提案はいらない。`,
  )
  if (!params.chatMode) {
    lines.push("report は、何日の分を振り返ったかの1行でよい。")
  }
  return lines.join("\n")
}

/** 「小さな驚き:」の下に並べる行（卒業→節目の順）。該当が無ければ空。 */
function achievementSurpriseLines(
  graduations: readonly AchievementGraduation[],
  milestones: readonly AchievementMilestone[],
): readonly string[] {
  const graduationLines = graduations.map(
    (graduation) =>
      `- 先輩タスクの卒業: ${graduation.id}（登録から ${String(graduation.days)} 日）`,
  )
  const milestoneLines = milestones.map((milestone) =>
    milestone.kind === "task"
      ? `- 節目: 通算 ${String(milestone.count)} 件目のタスク`
      : `- 節目: 通算 ${String(milestone.count)} コミット目`,
  )
  return [...graduationLines, ...milestoneLines]
}

/** 「今日」「昨日」、それより前は「9月21日」の形（`dayLabel` と違い曜日は付けない）。 */
function achievementRequestDayPhrase(date: string, today: string): string {
  if (date === today) {
    return "今日"
  }
  if (date === previousDateKey(today)) {
    return "昨日"
  }
  const parsed = Temporal.PlainDate.from(date)
  return `${String(parsed.month)}月${String(parsed.day)}日`
}

/** 「終えたタスクは 5 件。」/「終えたタスクは無いけれど。」/数えられないときは空文字。 */
function achievementTaskCountClause(doneTasks: AchievementDoneTasks): string {
  if (doneTasks.kind === "unknown") {
    return ""
  }
  if (doneTasks.items.length === 0) {
    return "終えたタスクは無いけれど。"
  }
  return `終えたタスクは ${String(doneTasks.items.length)} 件。`
}

/** 「- T-xxx summary」の並び。20件を超えたら「ほか n 件」の1行に畳む。 */
function achievementTaskListLines(doneTasks: AchievementDoneTasks): readonly string[] {
  if (doneTasks.kind === "unknown" || doneTasks.items.length === 0) {
    return []
  }
  const shown = doneTasks.items.slice(0, MAX_LISTED_REQUEST_TASKS)
  const rest = doneTasks.items.length - shown.length
  const lines = shown.map((task) => `- ${task.id} ${task.summary}`)
  return rest > 0 ? [...lines, `- ほか ${String(rest)} 件`] : lines
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
