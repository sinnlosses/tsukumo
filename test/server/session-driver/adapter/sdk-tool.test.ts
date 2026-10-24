import { describe, expect, it } from "vitest"

import { tsukumoServer } from "../../../../src/server/session-driver/adapter/sdk-tool.ts"
import { createCallReview } from "../../../../src/server/session-driver/core/call-review.ts"
import { listedToolNames } from "../../../fixture/mcp-server.ts"
import { CHAT_MODE, TOOL_EXPRESSIONS, FAKE_CWD, workServer } from "../../../fixture/sdk-tool.ts"

// どのツールが載るか・呼ぶと何が返るかを、モデルが見るのと同じ MCP の `tools/list` /
// `tools/call` で確かめる（サーバの中身を覗かず、公開された口だけを通す）。

describe("tsukumoServer", () => {
  it("仕事のときは report と work_plan と phase_result と question_brief が載り、remember / forget と見直しの2つは載らない", async () => {
    const names = await listedToolNames(workServer())

    expect(names).toEqual(["speak", "report", "work_plan", "phase_result", "question_brief"])
  })

  it("雑談のときは remember と forget が載り、recall / recall_episode は載らない", async () => {
    const names = await listedToolNames(
      tsukumoServer(
        TOOL_EXPRESSIONS,
        CHAT_MODE,
        createCallReview(),
        () => {},
        FAKE_CWD,
        () => {},
        () => {},
        () => true,
      ),
    )

    expect(names).toEqual(["speak", "remember", "forget"])
  })
})
