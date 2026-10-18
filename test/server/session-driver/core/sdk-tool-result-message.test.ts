import { expect, it } from "vitest"

import { toSessionEvents } from "../../../../src/server/session-driver/core/sdk-message.ts"
import { EXPRESSIONS } from "../../../fixture/sdk-assistant-message.ts"

it("tool_result をツールの終了にする", () => {
  const message = {
    type: "user",
    message: {
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: "toolu_1", content: "ダミーの結果", is_error: false },
      ],
    },
  }

  expect(toSessionEvents(message, EXPRESSIONS)).toEqual([
    { kind: "tool-finished", toolUseId: "toolu_1", content: "ダミーの結果", isError: false },
  ])
})

it("tool_result の content がブロックの配列でも、テキストだけをつなぐ", () => {
  const message = {
    type: "user",
    message: {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "toolu_1",
          content: [
            { type: "text", text: "1行目" },
            { type: "image", source: {} },
          ],
          is_error: true,
        },
      ],
    },
  }

  expect(toSessionEvents(message, EXPRESSIONS)).toEqual([
    { kind: "tool-finished", toolUseId: "toolu_1", content: "1行目\n\n(image)", isError: true },
  ])
})
