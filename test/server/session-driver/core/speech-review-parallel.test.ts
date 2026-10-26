import { describe, expect, it } from "vitest"

import {
  type CallReview,
  createCallReview,
} from "../../../../src/server/session-driver/core/call-review.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import { requestEvent } from "../../../fixture/session-event.ts"

type SpeechEvent = Extract<SessionEvent, { kind: "speech" }>

const speech = (text: string): SpeechEvent => ({ kind: "speech", text, expression: "default" })
const SPEAK_DRAWN: SessionEvent = { kind: "speak-drawn" }
const speakCalled = (toolUseId: string, text: string): SessionEvent => ({
  kind: "speak-called",
  toolUseId,
  speech: speech(text),
})
const finished = (toolUseId: string): SessionEvent => ({
  kind: "tool-finished",
  toolUseId,
  content: "ok",
  isError: false,
})
const toolStarted = (toolUseId: string): SessionEvent => ({
  kind: "tool-started",
  toolUseId,
  name: "Bash",
  input: {},
  parentToolUseId: undefined,
})

/** 先のターンで1回話し、別のツールの結果も受けたあと、`speak` と別のツールを同じ応答で呼んだ状態にする。 */
function reviewWithParallelCalls(): CallReview {
  const review = createCallReview()
  review.pass(requestEvent())
  review.judgeSpeak()
  review.pass(speakCalled("toolu_s0", "架空のセリフ0"))
  review.pass(finished("toolu_s0"))
  review.pass(toolStarted("toolu_b0"))
  review.pass(finished("toolu_b0"))
  review.pass(speakCalled("toolu_s1", "架空のセリフ1"))
  review.pass(toolStarted("toolu_b1"))
  return review
}

describe("SpeechReview の判定（同じ応答に別のツールと並べた speak）", () => {
  it("前のツールの結果を受けたあとなので、並べた speak は通り、描かれる", () => {
    const review = reviewWithParallelCalls()

    expect(review.judgeSpeak()).toEqual({ kind: "accepted" })
    expect(review.pass(finished("toolu_s1"))).toEqual([
      speech("架空のセリフ1"),
      SPEAK_DRAWN,
      finished("toolu_s1"),
    ])
  })

  it.each([
    ["speak の結果が先に届く", ["toolu_s1", "toolu_b1"]],
    ["並べたツールの結果が先に届く", ["toolu_b1", "toolu_s1"]],
  ])("%s順でも、並べたツールの結果は次の speak の新しい事実として残る", (_name, order) => {
    const review = reviewWithParallelCalls()
    review.judgeSpeak()
    for (const id of order) {
      review.pass(finished(id))
    }

    expect(review.judgeSpeak()).toEqual({ kind: "accepted" })
  })

  it("結果に一言添える speak だけの応答の次に、結果の届く前に別のツールと並べた speak は差し戻す", () => {
    const review = createCallReview()
    review.pass(requestEvent())
    review.judgeSpeak()
    review.pass(speakCalled("toolu_s0", "架空のセリフ0"))
    review.pass(finished("toolu_s0"))
    review.pass(toolStarted("toolu_b0"))
    review.pass(finished("toolu_b0"))
    review.judgeSpeak()
    review.pass(speakCalled("toolu_s1", "架空のセリフ1"))
    review.pass(finished("toolu_s1"))
    review.pass(speakCalled("toolu_s2", "架空のセリフ2"))
    review.pass(toolStarted("toolu_b2"))

    expect(review.judgeSpeak()).toEqual({
      kind: "rejected",
      text: expect.stringContaining("このセリフは画面に出していない"),
    })
  })

  it("並べたツールの結果がまだ届いていなければ、続く speak だけの応答は差し戻す", () => {
    const review = reviewWithParallelCalls()
    review.judgeSpeak()
    review.pass(finished("toolu_s1"))

    expect(review.judgeSpeak()).toEqual({
      kind: "rejected",
      text: expect.stringContaining("このセリフは画面に出していない"),
    })
  })
})
