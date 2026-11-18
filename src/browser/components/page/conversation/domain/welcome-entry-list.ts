// 始め方の一覧に並べる札を、おすすめの理由・セッションの一覧・前回の残り・タスク一覧から導く。

import {
  MAX_RECOMMENDATION_CARDS,
  type RecommendationCard,
} from "../../../../../shared/recommendation/recommendation-card.ts"
import {
  readyTasksInOrder,
  taskStartRequest,
} from "../../../../../shared/recommendation/recommendation-order.ts"
import {
  NO_WELCOME_HEAD,
  type WelcomeHead,
} from "../../../../../shared/recommendation/welcome-greeting.ts"
import type { TaskSummaryResult } from "../../../../../shared/repository/task-summary.ts"
import type { SessionChoice } from "../../../../../shared/session/session-choice.ts"

/** 見出しが無いセッションの代わりに出す字。 */
const NO_HEADING_LABEL = "（題なし）"

/** 前回の続きの札を迎えの挨拶で名指すときの名前。 */
const RESUME_GREETING_NAME = "前回の続き"

const RESUME_KEY = "resume"

/** 押すとすぐ `request` が送られる札。 */
export type WelcomeCard = {
  readonly kind: RecommendationCard["kind"]
  readonly key: string
  /** 札の頭の字（タスクの ID、前回の続きは前のセッションの見出し）。 */
  readonly id: string
  /** 題。バッククォートで囲んだ字は等幅で出す。 */
  readonly title: string
  /** おすすめの理由の1行。届いていなければ空。 */
  readonly reason: string
  readonly request: string
}

export type ResumeSource =
  | { readonly kind: "none" }
  | { readonly kind: "available"; readonly session: SessionChoice; readonly remaining: string }

/**
 * 前回の続きの要約を読む相手。無ければ取りに行かない。
 * 同じ作業ツリーの行だけから選ぶ（別の作業ツリーの行は札にしない）。
 * `otherSessions` はいまのセッションを除いた行。
 */
export function previousSessionOf(
  otherSessions: readonly SessionChoice[],
): SessionChoice | undefined {
  return otherSessions.find((session) => session.inCurrentWorktree)
}

/** 切り替え画面に、いまのセッション以外の行が1つでもあるか（作業ツリーは問わない）。 */
export function hasOtherSession(otherSessions: readonly SessionChoice[]): boolean {
  return otherSessions.length > 0
}

/**
 * 前回の続き、着手できる未着手のタスクをおすすめの順、と並べた先頭から {@link MAX_RECOMMENDATION_CARDS} 枚。
 * `recommendation` からは理由だけを当てる（理由が届いていない札の理由は空）。
 */
export function welcomeCardsOf(
  recommendation: readonly RecommendationCard[],
  resume: ResumeSource,
  tasks: TaskSummaryResult,
): readonly WelcomeCard[] {
  return [...resumeCards(resume), ...readyTaskCards(tasks)]
    .slice(0, MAX_RECOMMENDATION_CARDS)
    .map((card) => ({
      ...card,
      reason: recommendation.find((written) => keyOf(written) === card.key)?.reason ?? "",
    }))
}

/** 先頭の札を迎えの挨拶に差し込む名前にする（タスクは ID）。 */
export function welcomeHeadOf(cards: readonly WelcomeCard[]): WelcomeHead {
  const head = cards[0]
  if (head === undefined) {
    return NO_WELCOME_HEAD
  }
  return { kind: "card", name: head.key === RESUME_KEY ? RESUME_GREETING_NAME : head.id }
}

function keyOf(card: RecommendationCard): string {
  return card.kind === "resume" ? RESUME_KEY : card.taskId
}

function resumeCards(resume: ResumeSource): readonly WelcomeCard[] {
  if (resume.kind === "none") {
    return []
  }
  return [
    {
      kind: "resume",
      key: RESUME_KEY,
      id: resume.session.heading ?? NO_HEADING_LABEL,
      title: resume.remaining,
      reason: "",
      request: resumeRequestOf(resume.remaining),
    },
  ]
}

/**
 * 前回の続きの札が送る依頼。1行目は利用者が打つ依頼の文にする。
 * 新しいセッションは前回の残りを知らないので、2行目に名前を付けて添える。
 */
function resumeRequestOf(remaining: string): string {
  return `前回の続きを進めて。\n前回の残り: ${remaining}`
}

function readyTaskCards(tasks: TaskSummaryResult): readonly WelcomeCard[] {
  return readyTasksInOrder(tasks).map((task) => ({
    kind: "task" as const,
    key: task.id,
    id: task.id,
    title: task.summary,
    reason: "",
    request: taskStartRequest(task.id),
  }))
}
