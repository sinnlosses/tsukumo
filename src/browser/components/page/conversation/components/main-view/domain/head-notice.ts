// 知らせの行（`HeadNotice`）に出す語と、会話の流れの下端に浮く口。いま見ている中身の外で起きたことを1つだけ選ぶ。

import type { ConversationMoment } from "../../../../../../../shared/session/conversation-moment.ts"
import {
  phaseNumberText,
  phasePosition,
} from "../../../../../../../shared/session/work-plan-phase-number.ts"
import type { WorkPhase } from "../../../../../../../shared/session/work-plan.ts"
import type { MainViewContent } from "../../../stores/main-view-content.ts"
import type { TailReturn } from "./tail-return.ts"

/** `to-newest` は最新のやり取りへ移り、`to-inquiry` は移ったあとお伺いのカードまで転がす。 */
export type HeadNoticeAction = "to-newest" | "to-inquiry"

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
  if (content.kind === "report" && moment === "ask") {
    return { kind: "notice", text: "お伺いが届いた", action: "to-inquiry" }
  }
  return NO_NOTICE
}

/** 会話の流れの下端に浮く口。「お伺い ↓」と「末尾へ」を、同時に出さず1つにまとめる。 */
export type StreamFloat =
  | { readonly kind: "none" }
  | { readonly kind: "inquiry" }
  | { readonly kind: "tail"; readonly unseen: number }

export type StreamFloatInput = {
  /** 過去のやり取りを見ているか。 */
  readonly viewingPast: boolean
  /** 答え待ちのお伺いがあり、そのカードが見える範囲の外にあるか。 */
  readonly inquiryOutOfSight: boolean
  /** 最新のやり取りの流れを上へ送って読んでいるか（まだ見ていない新しい行の件数つき）。 */
  readonly tail: TailReturn
}

/**
 * 過去を見ているあいだは出さない（最新のやり取りの様子は、札の頭の知らせの行が伝える）。
 * 最新を見ているあいだは、お伺いのカードが見える範囲の外にあるときの「お伺い ↓」を先に出し（答えを待たせている用件が先）、無ければ上へ送って読んでいるときの「末尾へ」を出す。
 */
export function streamFloatOf(input: StreamFloatInput): StreamFloat {
  if (input.viewingPast) {
    return NONE_FLOAT
  }
  if (input.inquiryOutOfSight) {
    return { kind: "inquiry" }
  }
  return input.tail.kind === "away" ? { kind: "tail", unseen: input.tail.unseen } : NONE_FLOAT
}

const NONE_FLOAT = { kind: "none" } as const satisfies StreamFloat

function pastNotice(moment: ConversationMoment, phase: WorkPhase): HeadNotice {
  switch (moment) {
    case "work":
      return { kind: "notice", text: workingText(phase), action: "to-newest" }
    case "ask":
      return { kind: "notice", text: "お伺いが届いた", action: "to-inquiry" }
    case "stumble":
      return { kind: "notice", text: "失敗で終わった", action: "to-newest" }
    case "greet":
    case "deliver":
      return NO_NOTICE
  }
}

function workingText(phase: WorkPhase): string {
  if (phase.kind !== "phase") {
    return "作業中"
  }
  const position = phaseNumberText(phasePosition(phase))
  return position === "" ? "作業中" : `作業中 ${position}`
}
