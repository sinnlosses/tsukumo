import { describe, expect, it } from "vitest"

import { tsukumoServer } from "../../../../src/server/session-driver/adapter/sdk-tool.ts"
import { createCallReview } from "../../../../src/server/session-driver/core/call-review.ts"
import { listedToolNames } from "../../../fixture/mcp-server.ts"
import { CHAT_MODE, EXPRESSIONS, FAKE_CWD, workServer } from "../../../fixture/sdk-tool.ts"

// どのツールが載るか・呼ぶと何が返るかを、モデルが見るのと同じ MCP の `tools/list` /
// `tools/call` で確かめる（サーバの中身を覗かず、公開された口だけを通す）。

describe("tsukumoServer", () => {
  it("仕事のときは report と work_plan と phase_result と question_brief と recall / recall_episode が載り、remember / forget と見直しの2つは載らない", async () => {
    const names = await listedToolNames(workServer())

    expect(names).toEqual([
      "speak",
      "recall",
      "recall_episode",
      "report",
      "work_plan",
      "phase_result",
      "question_brief",
      "clear_and_send",
    ])
  })

  it("雑談のときは report も見直しの2つも載らない。diary も載らない（会話とは別の使い捨ての問い合わせ）", async () => {
    const names = await listedToolNames(
      tsukumoServer(
        EXPRESSIONS,
        CHAT_MODE,
        createCallReview(),
        () => {},
        FAKE_CWD,
        () => {},
        () => {},
        () => {},
        () => true,
      ),
    )

    expect(names).not.toContain("report")
    expect(names).not.toContain("work_plan")
    expect(names).not.toContain("phase_result")
    expect(names).not.toContain("clear_and_send")
    expect(names).not.toContain("usage_review_result")
    expect(names).not.toContain("diary")
    expect(names).toContain("speak")
    expect(names).toContain("remember")
  })

  it("雑談のときは recall と recall_episode の2段階が載り、keep と index はもう載らない", async () => {
    const names = await listedToolNames(
      tsukumoServer(
        EXPRESSIONS,
        CHAT_MODE,
        createCallReview(),
        () => {},
        FAKE_CWD,
        () => {},
        () => {},
        () => {},
        () => true,
      ),
    )

    expect(names).toEqual(["speak", "recall", "recall_episode", "remember", "forget"])
  })
})
