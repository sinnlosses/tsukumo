// 知らせの行（`HeadNotice`）に出す語。いま見ている中身の外で起きたことを1つだけ選ぶ。

import type { ConversationMoment } from "../../../../../../../shared/session/conversation-moment.ts"
import type { WorkPhase } from "../../../../../../../shared/session/work-plan.ts"
import type { MainViewContent } from "../../../../../../stores/main-view-content.ts"

/** `to-newest` は最新のやり取りへ移り、`to-question` は移ったあと答え待ちの札まで転がす。 */
export type HeadNoticeAction = "to-newest" | "to-question"

export type HeadNotice =
  | { readonly kind: "none" }
  | { readonly kind: "notice"; readonly text: string; readonly action: HeadNoticeAction }

export type HeadNoticeInput = {
  readonly content: MainViewContent
  /** いちばん新しいやり取りの局面。 */
  readonly moment: ConversationMoment
  /** 過去のやり取りを見ているか。 */
  readonly viewingPast: boolean
  /** いちばん新しいやり取りの今の段。 */
  readonly phase: WorkPhase
}

const NO_NOTICE = { kind: "none" } as const satisfies HeadNotice

export function headNoticeOf(input: HeadNoticeInput): HeadNotice {
  if (input.viewingPast) {
    return pastNotice(input.moment, input.phase)
  }
  const { content, moment } = input
  if (content.kind === "report" && (moment === "work" || moment === "ask")) {
    return moment === "ask"
      ? { kind: "notice", text: "お伺いが届いた", action: "to-question" }
      : { kind: "notice", text: "続きを作業中", action: "to-newest" }
  }
  return NO_NOTICE
}

function pastNotice(moment: ConversationMoment, phase: WorkPhase): HeadNotice {
  switch (moment) {
    case "work":
      return { kind: "notice", text: workingText(phase), action: "to-newest" }
    case "ask":
      return { kind: "notice", text: "お伺いが届いた", action: "to-question" }
    case "stumble":
      return { kind: "notice", text: "失敗で終わった", action: "to-newest" }
    case "greet":
    case "deliver":
      return NO_NOTICE
  }
}

function workingText(phase: WorkPhase): string {
  return phase.kind === "phase"
    ? `作業中 ${String(phase.index + 1)}/${String(phase.count)}`
    : "作業中"
}
