import { expect, it } from "vitest"

import { toSessionEvents } from "../../../../src/server/session-driver/core/sdk-message.ts"
import { EXPRESSIONS } from "../../../fixture/sdk-assistant-message.ts"

it("stream_event の text_delta を書きかけの本文にする", () => {
  const message = {
    type: "stream_event",
    event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "ダミ" } },
  }

  expect(toSessionEvents(message, EXPRESSIONS)).toEqual([
    { kind: "partial-utterance", text: "ダミ" },
  ])
})

it("サブエージェントの中の text_delta は書きかけの本文にしない", () => {
  const message = {
    type: "stream_event",
    event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Dum" } },
    parent_tool_use_id: "toolu_sub_1",
  }

  expect(toSessionEvents(message, EXPRESSIONS)).toEqual([])
})

it("stream_event でも本文以外の断片は無視する", () => {
  const started = {
    type: "stream_event",
    event: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
  }
  const thinking = {
    type: "stream_event",
    event: {
      type: "content_block_delta",
      index: 0,
      delta: { type: "thinking_delta", thinking: "ダミーの思考" },
    },
  }

  expect(toSessionEvents(started, EXPRESSIONS)).toEqual([])
  expect(toSessionEvents(thinking, EXPRESSIONS)).toEqual([])
})
