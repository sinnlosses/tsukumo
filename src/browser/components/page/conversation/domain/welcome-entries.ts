// 迎える口に並べる札を、おすすめの並び・セッションの一覧・前回の要約・タスク一覧から導く。

import {
  MAX_RECOMMENDATION_CARDS,
  type RecommendationCard,
} from "../../../../../shared/recommendation/recommendation-card.ts"
import {
  NO_WELCOME_HEAD,
  type WelcomeHead,
} from "../../../../../shared/recommendation/welcome-greeting.ts"
import {
  taskReadiness,
  type TaskSummaryResult,
} from "../../../../../shared/repository/task-summary.ts"
import type { SessionChoice } from "../../../../../shared/session/session-choice.ts"
import { remainingOf } from "../../../../domain/session-summary.ts"

/** 見出しが無いセッションの代わりに出す字。 */
const NO_HEADING_LABEL = "（題なし）"

/** 前回の続きの札を迎えの挨拶で名指すときの名前。 */
const RESUME_GREETING_NAME = "前回の続き"

const RESUME_KEY = "resume"

/** 押すとすぐ `request` が送られる札。 */
export type WelcomeCard = {
  readonly key: string
  /** 札の頭の字（タスクの ID、前回の続きは前のセッションの見出し）。 */
  readonly id: string
  /** 題。バッククォートで囲んだ字は等幅で出す。 */
  readonly title: string
  /** おすすめの理由の1行。届いていなければ空。 */
  readonly reason: string
  readonly request: string
}

/** 前回の続きの要約を読む相手。無ければ取りに行かない。 */
export function previousSessionOf(
  sessions: readonly SessionChoice[],
  currentSessionId: string | undefined,
): SessionChoice | undefined {
  return sessions.find((session) => session.sessionId !== currentSessionId)
}

/** おすすめの並びを先に当て、足りない枠は既定の並びで理由なしに埋める。 */
export function welcomeCardsOf(
  recommendation: readonly RecommendationCard[],
  previous: SessionChoice | undefined,
  previousSummary: string | undefined,
  tasks: TaskSummaryResult,
): readonly WelcomeCard[] {
  const available = [...resumeCards(previous, previousSummary), ...readyTaskCards(tasks)]
  const recommended = uniqueByKey(
    recommendation.flatMap((card) => {
      const found = available.find((entry) => entry.key === keyOf(card))
      return found === undefined ? [] : [{ ...found, reason: card.reason }]
    }),
  ).slice(0, MAX_RECOMMENDATION_CARDS)
  const filler = available.filter((entry) => !recommended.some((card) => card.key === entry.key))
  return [...recommended, ...filler].slice(0, MAX_RECOMMENDATION_CARDS)
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

function resumeCards(
  previous: SessionChoice | undefined,
  previousSummary: string | undefined,
): readonly WelcomeCard[] {
  const remaining = previousSummary === undefined ? undefined : remainingOf(previousSummary)
  if (previous === undefined || remaining === undefined) {
    return []
  }
  return [
    {
      key: RESUME_KEY,
      id: previous.heading ?? NO_HEADING_LABEL,
      title: remaining,
      reason: "",
      request: `前回の続き: ${remaining}`,
    },
  ]
}

function readyTaskCards(tasks: TaskSummaryResult): readonly WelcomeCard[] {
  if (tasks.kind !== "known") {
    return []
  }
  return tasks.items
    .filter((task) => taskReadiness(task)?.kind === "ready")
    .map((task) => ({
      key: task.id,
      id: task.id,
      title: task.summary,
      reason: "",
      request: `${task.id} に着手して`,
    }))
}

function uniqueByKey(cards: readonly WelcomeCard[]): readonly WelcomeCard[] {
  return cards.filter((card, index) => cards.findIndex((other) => other.key === card.key) === index)
}
