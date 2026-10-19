import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk"

import { tsukumoServer } from "../../src/server/session-driver/adapter/sdk-tool.ts"
import {
  type CallReview,
  createCallReview,
} from "../../src/server/session-driver/core/call-review.ts"
import type {
  ChatRecall,
  SessionMode,
} from "../../src/server/session-driver/core/session-driver.ts"
import type { QuestionBrief } from "../../src/shared/session-driver/question-brief.ts"
import type { SessionEvent } from "../../src/shared/session/session-event.ts"
import { fixedChatSummary } from "./chat.ts"

export const EXPRESSIONS = [{ name: "default", label: "通常" }] as const
export const FAKE_CWD = "/tmp/tsukumo-架空のcwd"

export const NOT_FOUND_RECALL = {
  recallList: () => ({ kind: "not-found" }),
  recallEpisode: () => ({ kind: "not-found" }),
  finishTurn: () => {},
} satisfies ChatRecall

export const WORK_MODE: SessionMode = {
  kind: "work",
  chatRecall: NOT_FOUND_RECALL,
  reportSchema: "json-schema",
}

/** `report` の塊の型を短い型の表記で渡す仕事のモード。 */
export const SHORT_TYPE_WORK_MODE: SessionMode = { ...WORK_MODE, reportSchema: "short-type" }

export const CHAT_MODE: SessionMode = {
  kind: "chat",
  personaMemory: { remember: () => "written", forget: () => "erased", finishTurn: () => {} },
  chatSummary: fixedChatSummary(undefined),
  chatRecall: NOT_FOUND_RECALL,
}

/** `report` に渡す締めのセリフ（架空）。 */
export const CLOSING = { text: "架空の締めの一言", expression: "default" }

/** `report` に渡す待ちの一言とセッションの要約（架空）。どちらも組んだ値に欠かせない。 */
export const WAITING_LINE = { text: "架空の待ちの一言", expression: "default" }
export const SUMMARY = "架空の要約"
export const REMAINING = "架空の残り"

/** `report` に渡す図の欄（組んだ値に欠かせない）。図を置かない理由を言う形。 */
export const FIGURE = { kind: "none", reason: "short-answer" }

/**
 * 仕事のサーバ。handler が流したイベントは `events` に積む。
 * `report` が受け取った題は `titles` に、`question_brief` が預けた添え書きは `heldBriefs` に積む。
 */
export function workServer(
  events: SessionEvent[] = [],
  titles: string[] = [],
  callReview: CallReview = createCallReview(),
  heldBriefs: (readonly QuestionBrief[])[] = [],
  mode: SessionMode = WORK_MODE,
): McpSdkServerConfigWithInstance {
  return tsukumoServer(
    EXPRESSIONS,
    mode,
    callReview,
    (title) => {
      titles.push(title)
    },
    FAKE_CWD,
    (event) => {
      events.push(event)
    },
    (briefs) => {
      heldBriefs.push(briefs)
    },
    () => {},
    () => true,
  )
}
