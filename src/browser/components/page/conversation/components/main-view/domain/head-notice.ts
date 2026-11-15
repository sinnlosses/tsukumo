// 知らせの行（`HeadNotice`）に出す語。いま見ている中身の外で起きたことを1つだけ選ぶ。

import type { ConversationMoment } from "../../../../../../../shared/session/conversation-moment.ts"
import {
  phaseNumberText,
  phasePosition,
} from "../../../../../../../shared/session/work-plan-phase-number.ts"
import type { WorkPhase } from "../../../../../../../shared/session/work-plan.ts"
import type { MainViewContent } from "../../../stores/main-view-content.ts"

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

/** 会話の流れの下端に浮く口。知らせの行と「お伺い ↓」の2つを、同時に出さず1つにまとめる。 */
export type StreamFloat =
  | { readonly kind: "none" }
  | { readonly kind: "inquiry" }
  | { readonly kind: "notice"; readonly text: string; readonly action: HeadNoticeAction }

export type StreamFloatInput = {
  readonly notice: HeadNotice
  /** 過去のやり取りを見ているか。 */
  readonly viewingPast: boolean
  /** 答え待ちのお伺いがあり、そのカードが見える範囲の外にあるか。 */
  readonly inquiryOutOfSight: boolean
}

/**
 * 過去を見ているあいだは知らせの行だけを出す（最新のやり取りのお伺いは、知らせが同じ行き先で伝える）。
 * 最新を見ているあいだは、お伺いのカードが見える範囲の外にあるときだけ「お伺い ↓」を出す（最新を見ているときの知らせはお伺いの届きだけで、同じ行き先）。
 */
export function streamFloatOf(input: StreamFloatInput): StreamFloat {
  if (input.viewingPast) {
    return input.notice
  }
  return input.inquiryOutOfSight ? { kind: "inquiry" } : { kind: "none" }
}

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
