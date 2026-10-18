import { expect, it } from "vitest"

import { toSessionEvents } from "../../../../src/server/session-driver/core/sdk-message.ts"
import { assistantMessage, EXPRESSIONS } from "../../../fixture/sdk-assistant-message.ts"
import { SPEAK_TOOL_FULL_NAME } from "../../../fixture/sdk-message.ts"

it("メインの speak の呼び出しは、呼び出しの id 付きのセリフにする（ツールの開始にはしない）", () => {
  const message = assistantMessage([
    {
      type: "tool_use",
      id: "toolu_2",
      name: SPEAK_TOOL_FULL_NAME,
      input: { text: "いくよ！", expression: "proud" },
    },
  ])

  expect(toSessionEvents(message, EXPRESSIONS)).toEqual([
    {
      kind: "speak-called",
      toolUseId: "toolu_2",
      speech: { kind: "speech", text: "いくよ！", expression: "proud" },
    },
  ])
})

it("サブエージェントの speak の呼び出しは、id を付けずにセリフにする", () => {
  const message = assistantMessage(
    [
      {
        type: "tool_use",
        id: "toolu_2",
        name: SPEAK_TOOL_FULL_NAME,
        input: { text: "架空のセリフ", expression: "proud" },
      },
    ],
    "toolu_sub_1",
  )

  expect(toSessionEvents(message, EXPRESSIONS)).toEqual([
    { kind: "speech", text: "架空のセリフ", expression: "proud" },
  ])
})

it("キャラクターパックに無い表情名は default に落とす", () => {
  const message = assistantMessage([
    {
      type: "tool_use",
      id: "toolu_2",
      name: SPEAK_TOOL_FULL_NAME,
      input: { text: "いくよ！", expression: "flustered" },
    },
  ])

  expect(toSessionEvents(message, EXPRESSIONS)).toEqual([
    {
      kind: "speak-called",
      toolUseId: "toolu_2",
      speech: { kind: "speech", text: "いくよ！", expression: "default" },
    },
  ])
})

it("speak の text が無いときはセリフにしない", () => {
  const message = assistantMessage([
    {
      type: "tool_use",
      id: "toolu_2",
      name: SPEAK_TOOL_FULL_NAME,
      input: { expression: "proud" },
    },
  ])

  expect(toSessionEvents(message, EXPRESSIONS)).toEqual([])
})
