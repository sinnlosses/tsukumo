import { expect, it } from "vitest"
import { z } from "zod"

import { toSessionEvents } from "../../../../../src/server/session-driver/core/message/sdk-message.ts"
import { speechEvents } from "../../../../../src/server/session-driver/core/message/sdk-speech-message.ts"
import { speakInputShape } from "../../../../../src/server/session-driver/core/message/speak-input.ts"
import {
  assistantMessageWithoutUuid,
  EXPRESSIONS,
} from "../../../../fixture/sdk-assistant-message.ts"
import { SPEAK_TOOL_FULL_NAME } from "../../../../fixture/sdk-message.ts"

it("メインの speak の呼び出しは、呼び出しの id 付きのセリフにする（ツールの開始にはしない）", () => {
  const message = assistantMessageWithoutUuid([
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
  const message = assistantMessageWithoutUuid(
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
  const message = assistantMessageWithoutUuid([
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

it("adapter の tool() に渡す shape と同じ schema を通り、phase があっても読める", () => {
  const input = { text: "いくよ！", expression: "proud", phase: 2 }

  expect(z.object(speakInputShape(EXPRESSIONS)).safeParse(input).success).toBe(true)
  expect(speechEvents(input, EXPRESSIONS)).toEqual([
    { kind: "speech", text: "いくよ！", expression: "proud" },
  ])
})

it("phase が不正でも、セリフは捨てずに読む", () => {
  for (const phase of ["2", 1.5]) {
    expect(speechEvents({ text: "いくよ！", expression: "proud", phase }, EXPRESSIONS)).toEqual([
      { kind: "speech", text: "いくよ！", expression: "proud" },
    ])
  }
})

it("speak の text が無いときはセリフにしない", () => {
  const message = assistantMessageWithoutUuid([
    {
      type: "tool_use",
      id: "toolu_2",
      name: SPEAK_TOOL_FULL_NAME,
      input: { expression: "proud" },
    },
  ])

  expect(toSessionEvents(message, EXPRESSIONS)).toEqual([])
})
