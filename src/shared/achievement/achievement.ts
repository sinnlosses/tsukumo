// 成果の画面が取りに行く応答の型と、見る日の決め方・振り返りの依頼文。
// 運ぶのはコミットの数とタスクの ID・summary だけで、コミットの件名も会話の文面も入れない。

import { z } from "zod"

import { dailyDiaryStatusSchema, type DailyDiaryStatus } from "../diary/diary.ts"

/**
 * 見る日の選び方（成果の手続きの入力）。
 * ブラウザは時計を読まないので「今日」を日付では送らない（`today`）。
 * `chosen` の `date` は `YYYY-MM-DD` のつもりの生の文字列で、読めない・今日より先なら今日に倒す（{@link resolveAchievementDateKey}）。
 */
export const achievementDaySelectionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("today") }),
  z.object({ kind: z.literal("chosen"), date: z.string() }),
])

export type AchievementDaySelection = z.infer<typeof achievementDaySelectionSchema>

/** 終えたタスク1件（ID と、画面・依頼に出す要約）。 */
export type AchievementTask = {
  readonly id: string
  readonly summary: string
}

/**
 * その日に終えたタスクの一覧。
 * `.beads` が無いリポジトリ（tsukumo をほかのプロジェクトで起こしたとき）と `tasks: "off"` では `unknown` で、コミットの数だけは出す。
 */
export type AchievementDoneTasks =
  | { readonly kind: "unknown" }
  | { readonly kind: "known"; readonly items: readonly AchievementTask[] }

/**
 * その日に入ったコミットの数。
 * 数える枝が読めない（git リポジトリでない・枝が無い・`HEAD` が枝を指さない）けれど Beads は読めたときは `unknown` で、画面はコミットの数を出さない。
 */
export type AchievementCommits =
  | { readonly kind: "unknown" }
  | { readonly kind: "known"; readonly count: number }

/** 先輩タスクの卒業1件。登録から7日以上経っていた、その日に終えたタスクだけが対象。 */
export type AchievementGraduation = {
  readonly id: string
  readonly summary: string
  /** 登録日（`YYYY-MM-DD`）。Beads の課題を作った日。 */
  readonly registeredOn: string
  /** 登録から終えた日までの日数。 */
  readonly days: number
}

/**
 * 節目1件。通算のタスクの数・コミットの数が刻みの倍数をその日にまたいだとき。
 * 1日に同じ種類を複数またいでも大きいほう1つだけ。
 */
export type AchievementMilestone =
  | { readonly kind: "task"; readonly count: number; readonly taskId: string }
  | { readonly kind: "commit"; readonly count: number; readonly time: string }

/**
 * 成果の手続き（1日ぶん）の応答。
 * 数える枝も Beads も読めないときは画面ごと `unknown`。
 */
export type DailyAchievement =
  | { readonly kind: "unknown" }
  | {
      readonly kind: "known"
      /** 見た日（`YYYY-MM-DD`）。クエリが無い・読めない・今日より先なら今日に倒した結果。 */
      readonly date: string
      /** サーバのローカル時刻の今日（`YYYY-MM-DD`）。ブラウザは時計を読まない。 */
      readonly today: string
      readonly commits: AchievementCommits
      readonly doneTasks: AchievementDoneTasks
      /** 該当が無ければ空の並び。終えたタスクが `unknown` ならいつも空。 */
      readonly graduations: readonly AchievementGraduation[]
      /** 該当が無ければ空の並び。終えたタスクが `unknown` なら節目「task」が、コミットが `unknown` なら節目「commit」が出ない。 */
      readonly milestones: readonly AchievementMilestone[]
      /** その日の日記の状態。読めなくても成果そのものは配る（`unreadable`）。 */
      readonly diary: DailyDiaryStatus
    }

/** 読めない・配られない形は「取れなかった」に倒す既定値。 */
export const UNKNOWN_ACHIEVEMENT = { kind: "unknown" } satisfies DailyAchievement

const achievementTaskSchema = z.object({ id: z.string(), summary: z.string() })

const achievementDoneTasksSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("unknown") }),
  z.object({ kind: z.literal("known"), items: z.array(achievementTaskSchema).readonly() }),
])

const achievementCommitsSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("unknown") }),
  z.object({ kind: z.literal("known"), count: z.number() }),
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

/** 配る形そのもの（{@link DailyAchievement} と同じ鍵）。 */
export const dailyAchievementSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("unknown") }),
  z.object({
    kind: z.literal("known"),
    date: z.string(),
    today: z.string(),
    commits: achievementCommitsSchema,
    doneTasks: achievementDoneTasksSchema,
    graduations: z.array(achievementGraduationSchema).readonly(),
    milestones: z.array(achievementMilestoneSchema).readonly(),
    diary: dailyDiaryStatusSchema,
  }),
])

/** 依頼文の一覧に並べるタスクの上限。 */
const MAX_LISTED_REQUEST_TASKS = 20

/**
 * 空の日か（コミットも終えたタスクも0）。コミットの数が分からない（`unknown`）ときは0とみなす。
 * 終えたタスクの記録が無い（`unknown`）ときは「空」と決めない。
 * コミットが0でもタスクの有無が分からないので、押せなくする理由にはしない。
 */
export function isEmptyAchievementDay(
  commits: AchievementCommits,
  doneTasks: AchievementDoneTasks,
): boolean {
  return (
    (commits.kind === "unknown" || commits.count === 0) &&
    doneTasks.kind === "known" &&
    doneTasks.items.length === 0
  )
}

/** 灯りの段階を決める数。コミットの数が分かればそれ、分からなければ終えたタスクの件数。 */
export function lampCountOf(commits: AchievementCommits, doneTasks: AchievementDoneTasks): number {
  if (commits.kind === "known") {
    return commits.count
  }
  return doneTasks.kind === "known" ? doneTasks.items.length : 0
}

/**
 * 振り返りのボタンを押したときに、会話とは別の使い捨ての問い合わせへ送る依頼文。
 * 画面に出している数だけから組み立て、コミットの件名や会話の文面は入れない。
 * 会話のモードに関わらず同じ問い合わせに渡すので、モードでは文面を変えない。
 */
export function achievementReflectionRequestText(params: {
  readonly date: string
  readonly today: string
  readonly commits: AchievementCommits
  readonly doneTasks: AchievementDoneTasks
  /** 該当が無ければ空の並び。 */
  readonly graduations: readonly AchievementGraduation[]
  /** 該当が無ければ空の並び。 */
  readonly milestones: readonly AchievementMilestone[]
  /** その日に既に日記があるか（続きとして書き足す1行を足す）。 */
  readonly alreadyWritten: boolean
}): string {
  const dayPhrase = achievementRequestDayPhrase(params.date, params.today)
  const taskCountClause = achievementTaskCountClause(params.doneTasks)
  const headLine = `${dayPhrase}の成果を一緒に振り返って、この日の日記を書いてほしい。${achievementCountSentence(params.commits, taskCountClause)}`

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
  return lines.join("\n")
}

/** 依頼文の1行目の数の文。コミットが分からなければ終えたタスクの句だけ。 */
function achievementCountSentence(commits: AchievementCommits, taskCountClause: string): string {
  if (commits.kind === "unknown") {
    return taskCountClause
  }
  const commitClause = `main に入ったコミットは ${String(commits.count)} 件`
  return taskCountClause === "" ? `${commitClause}。` : `${commitClause}、${taskCountClause}`
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

/** 「今日」「昨日」、それより前は「9月21日」の形（曜日は付けない）。 */
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
 * 見る日を日付キーに決める。
 * 今日を選んだ・`YYYY-MM-DD` に読めない・`today` より先のときは `today` に倒す（呼ぶ側が書き間違えても画面は出る）。
 * 「今日」を決めるのは呼ぶ側（サーバのローカル時刻）で、ここは比べるだけ。
 */
export function resolveAchievementDateKey(
  selection: AchievementDaySelection,
  today: string,
): string {
  if (selection.kind === "today") {
    return today
  }
  const date = dateKeyOf(selection.date)
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
