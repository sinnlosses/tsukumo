// 成果の画面が取りに行く応答の型と、見る日の決め方・振り返りの依頼文。
// 運ぶのはタスクの ID・summary と数だけで、会話の文面は入れない。

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
 * 節目1件。通算の終えたタスクの数が刻みの倍数をその日にまたいだとき。
 * 1日に複数またいでも大きいほう1つだけ。
 */
export type AchievementMilestone = {
  readonly count: number
  readonly taskId: string
}

/**
 * 成果の手続き（1日ぶん）の応答。
 * Beads が読めない（`.beads` が無い・`bd` が無い）ときは画面ごと `unknown`。
 */
export type DailyAchievement =
  | { readonly kind: "unknown" }
  | {
      readonly kind: "known"
      /** 見た日（`YYYY-MM-DD`）。クエリが無い・読めない・今日より先なら今日に倒した結果。 */
      readonly date: string
      /** サーバのローカル時刻の今日（`YYYY-MM-DD`）。ブラウザは時計を読まない。 */
      readonly today: string
      /** その日に閉じた Beads の課題。 */
      readonly doneTasks: readonly AchievementTask[]
      /** 該当が無ければ空の並び。 */
      readonly graduations: readonly AchievementGraduation[]
      /** 該当が無ければ空の並び。 */
      readonly milestones: readonly AchievementMilestone[]
      /** その日の日記の状態。読めなくても成果そのものは配る（`unreadable`）。 */
      readonly diary: DailyDiaryStatus
    }

const achievementTaskSchema = z.object({ id: z.string(), summary: z.string() })

const achievementGraduationSchema = z.object({
  id: z.string(),
  summary: z.string(),
  registeredOn: z.string(),
  days: z.number(),
})

const achievementMilestoneSchema = z.object({ count: z.number(), taskId: z.string() })

/** 配る形そのもの（{@link DailyAchievement} と同じ鍵）。 */
export const dailyAchievementSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("unknown") }),
  z.object({
    kind: z.literal("known"),
    date: z.string(),
    today: z.string(),
    doneTasks: z.array(achievementTaskSchema).readonly(),
    graduations: z.array(achievementGraduationSchema).readonly(),
    milestones: z.array(achievementMilestoneSchema).readonly(),
    diary: dailyDiaryStatusSchema,
  }),
])

/** 依頼文の一覧に並べるタスクの上限。 */
const MAX_LISTED_REQUEST_TASKS = 20

/** 空の日か（その日に終えたタスクが0）。空の日は振り返れない。 */
export function isEmptyAchievementDay(doneTasks: readonly AchievementTask[]): boolean {
  return doneTasks.length === 0
}

/**
 * 振り返りのボタンを押したときに、会話とは別の使い捨ての問い合わせへ送る依頼文。
 * 画面に出している数だけから組み立て、会話の文面は入れない。
 * 会話のモードに関わらず同じ問い合わせに渡すので、モードでは文面を変えない。
 * 空の日（{@link isEmptyAchievementDay}）には呼ばない。
 */
export function achievementReflectionRequestText(params: {
  readonly date: string
  readonly today: string
  readonly doneTasks: readonly AchievementTask[]
  /** 該当が無ければ空の並び。 */
  readonly graduations: readonly AchievementGraduation[]
  /** 該当が無ければ空の並び。 */
  readonly milestones: readonly AchievementMilestone[]
  /** その日に既に日記があるか（続きとして書き足す1行を足す）。 */
  readonly alreadyWritten: boolean
}): string {
  const dayPhrase = achievementRequestDayPhrase(params.date, params.today)
  const lines = [
    `${dayPhrase}の成果を一緒に振り返って、この日の日記を書いてほしい。終えたタスクは ${String(params.doneTasks.length)} 件。`,
    "終えたタスク:",
    ...achievementTaskListLines(params.doneTasks),
  ]
  const surpriseLines = achievementSurpriseLines(params.graduations, params.milestones)
  if (surpriseLines.length > 0) {
    lines.push("小さな驚き:", ...surpriseLines)
  }
  if (params.alreadyWritten) {
    lines.push("この日の日記は既にあるので、続きとして書き足す。")
  }
  lines.push(
    "日記は diary ツールで1回書いて。本文はこの日の仕事の感想とねぎらいを短く。しおりには終えたタスクから1件を選び、選んだ理由を添える。ファイルやログは読みに行かず、この一覧だけで書いてほしい。次にやることの提案はいらない。",
  )
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
  const milestoneLines = milestones.map(
    (milestone) => `- 節目: 通算 ${String(milestone.count)} 件目のタスク`,
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

/** 「- <ID> summary」の並び。20件を超えたら「ほか n 件」の1行に畳む。 */
function achievementTaskListLines(doneTasks: readonly AchievementTask[]): readonly string[] {
  const shown = doneTasks.slice(0, MAX_LISTED_REQUEST_TASKS)
  const rest = doneTasks.length - shown.length
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
