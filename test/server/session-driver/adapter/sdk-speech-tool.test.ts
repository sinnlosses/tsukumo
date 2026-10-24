import { describe, expect, it } from "vitest"

import { tsukumoServer } from "../../../../src/server/session-driver/adapter/sdk-tool.ts"
import {
  type CallReview,
  createCallReview,
} from "../../../../src/server/session-driver/core/call-review.ts"
import { PHASE_MENTION_REJECTION_TEXT } from "../../../../src/server/session-driver/core/phase-mention.ts"
import { SPEECH_NOTHING_NEW_REJECTION_TEXT } from "../../../../src/server/session-driver/core/speech-review.ts"
import { callTool } from "../../../fixture/mcp-server.ts"
import {
  CHAT_MODE,
  CLOSING,
  EXPRESSIONS,
  FAKE_CWD,
  FIGURE,
  REMAINING,
  SUMMARY,
  WAITING_LINE,
  workServer,
} from "../../../fixture/sdk-tool.ts"

describe("speak の差し戻し", () => {
  it("仕事のときは、描いたセリフのあとに新しい事実の無い speak を差し戻しの一文で返す", async () => {
    const reply = await callTool(workServer([], [], spokenReview()), "speak", CLOSING)

    expect(reply).toEqual({
      text: SPEECH_NOTHING_NEW_REJECTION_TEXT,
      isError: true,
      endsTurn: false,
    })
  })

  it("雑談のときは差し戻さない", async () => {
    const reply = await callTool(
      tsukumoServer(
        EXPRESSIONS,
        CHAT_MODE,
        spokenReview(),
        () => {},
        FAKE_CWD,
        () => {},
        () => {},
        () => true,
      ),
      "speak",
      CLOSING,
    )

    expect(reply).toEqual({ text: "ok", isError: false, endsTurn: false })
  })
})

/** セリフを1つ描いたあと、新しい事実の届いていない `CallReview`。 */
function spokenReview(): CallReview {
  const review = createCallReview()
  review.pass({
    kind: "speak-called",
    toolUseId: "toolu_speak_1",
    speech: { kind: "speech", text: "架空のセリフ", expression: "default" },
  })
  review.pass({ kind: "tool-finished", toolUseId: "toolu_speak_1", content: "ok", isError: false })
  return review
}

function rangedReview(): CallReview {
  const review = createCallReview()
  review.pass({ kind: "request", text: "架空の依頼", images: [] })
  review.judgeWorkPlan({
    phases: ["架空の計画", "架空の実装A", "架空の実装B", "架空の受け入れ"],
    current: 0,
    delegatedRange: { first: 1, count: 2 },
  })
  return review
}

describe("speak の phase の差し戻し", () => {
  const rejected = { text: PHASE_MENTION_REJECTION_TEXT, isError: true, endsTurn: false }

  it("範囲があるあいだ、範囲の外の phase の speak を差し戻し、範囲の中の phase は通す", async () => {
    expect(
      await callTool(workServer([], [], rangedReview()), "speak", {
        text: "架空のセリフ",
        expression: "default",
        phase: 3,
      }),
    ).toEqual(rejected)
    expect(
      await callTool(workServer([], [], rangedReview()), "speak", {
        text: "架空のセリフ",
        expression: "default",
        phase: 2,
      }),
    ).toMatchObject({ isError: false })
  })

  it("本文の段の番号は読まず、phase を省いた speak と report は範囲の外の番号を書いても通る", async () => {
    expect(
      await callTool(workServer([], [], rangedReview()), "speak", {
        text: "段9が返った。階段3も見た",
        expression: "default",
      }),
    ).toMatchObject({ isError: false })
    expect(
      await callTool(workServer([], [], rangedReview()), "report", {
        conclusion: ["段9まで済んだ"],
        workPlanClosing: "stopped",
        closing: { text: "段9まで済んだ", expression: "default" },
        figure: FIGURE,
        sessionSummary: SUMMARY,
        sessionRemaining: REMAINING,
        waitingLine: WAITING_LINE,
      }),
    ).toMatchObject({ isError: false, endsTurn: true })
  })

  it("範囲が無ければ phase を検査しない", async () => {
    expect(
      await callTool(workServer(), "speak", {
        text: "架空のセリフ",
        expression: "default",
        phase: 9,
      }),
    ).toMatchObject({ isError: false })
  })
})
