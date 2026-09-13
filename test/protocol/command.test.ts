import { describe, expect, it } from "bun:test"

import { MAX_PROMPT_TEXT_LENGTH, parseClientCommand } from "../../src/protocol/command.ts"

// 文面はすべて手で書いた架空のもの（docs/coding-standards.md「会話内容の扱い」）。
describe("parseClientCommand（受け付ける形）", () => {
  it("prompt を受け付ける", () => {
    expect(parseClientCommand({ type: "prompt", commandId: "c-1", text: "架空の依頼" })).toEqual({
      type: "prompt",
      commandId: "c-1",
      text: "架空の依頼",
    })
  })

  it("interrupt・answer・set-model・set-permission-mode を受け付ける", () => {
    expect(parseClientCommand({ type: "interrupt", commandId: "c-2" })).toEqual({
      type: "interrupt",
      commandId: "c-2",
    })
    expect(
      parseClientCommand({
        type: "answer",
        commandId: "c-3",
        id: "toolu_1",
        answer: { kind: "answers", labels: ["こっち"] },
      }),
    ).toEqual({
      type: "answer",
      commandId: "c-3",
      id: "toolu_1",
      answer: { kind: "answers", labels: ["こっち"] },
    })
    expect(parseClientCommand({ type: "set-model", commandId: "c-4", model: "opus" })).toEqual({
      type: "set-model",
      commandId: "c-4",
      model: "opus",
    })
    expect(
      parseClientCommand({ type: "set-permission-mode", commandId: "c-5", mode: "plan" }),
    ).toEqual({ type: "set-permission-mode", commandId: "c-5", mode: "plan" })
  })
})

describe("parseClientCommand（落とす形）", () => {
  it("知らない type・commandId の無い形は undefined", () => {
    expect(parseClientCommand({ type: "shout", commandId: "c-1", text: "あ" })).toBeUndefined()
    expect(parseClientCommand({ type: "prompt", text: "架空の依頼" })).toBeUndefined()
    expect(parseClientCommand("prompt")).toBeUndefined()
    expect(parseClientCommand(undefined)).toBeUndefined()
  })

  it("空白だけの依頼と、上限を超えた依頼は undefined", () => {
    expect(parseClientCommand({ type: "prompt", commandId: "c-1", text: "   " })).toBeUndefined()
    expect(
      parseClientCommand({
        type: "prompt",
        commandId: "c-1",
        text: "あ".repeat(MAX_PROMPT_TEXT_LENGTH + 1),
      }),
    ).toBeUndefined()
  })

  it("一覧に無いモデル・許可モード、形の合わない答えは undefined", () => {
    expect(
      parseClientCommand({ type: "set-model", commandId: "c-4", model: "gpt" }),
    ).toBeUndefined()
    expect(
      parseClientCommand({ type: "set-permission-mode", commandId: "c-5", mode: "dontAsk" }),
    ).toBeUndefined()
    expect(
      parseClientCommand({
        type: "answer",
        commandId: "c-3",
        id: "toolu_1",
        answer: { kind: "??" },
      }),
    ).toBeUndefined()
  })
})
