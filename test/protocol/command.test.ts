import { describe, expect, it } from "bun:test"

import {
  isCharacterEditCommand,
  MAX_PROMPT_TEXT_LENGTH,
  parseClientCommand,
} from "../../src/protocol/command.ts"
import { MAX_PORTRAIT_BYTES } from "../../src/protocol/portrait-image.ts"

// 立ち絵の代わりに使う、1バイトぶんの架空の data URL（中身は見ないので何でもよい）。
const TINY_PNG_DATA_URL = "data:image/png;base64,AAAA"

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

describe("parseClientCommand（キャラクターの見た目）", () => {
  it("set-portrait は表情と data URL を受け付ける", () => {
    expect(
      parseClientCommand({
        type: "set-portrait",
        commandId: "c-6",
        expression: "proud",
        image: TINY_PNG_DATA_URL,
      }),
    ).toEqual({
      type: "set-portrait",
      commandId: "c-6",
      expression: "proud",
      image: TINY_PNG_DATA_URL,
    })
  })

  it("set-outfit-accent は衣装と16進の色を受け付ける", () => {
    expect(
      parseClientCommand({
        type: "set-outfit-accent",
        commandId: "c-7",
        outfit: "heavy",
        color: "#ffb3a7",
      }),
    ).toEqual({ type: "set-outfit-accent", commandId: "c-7", outfit: "heavy", color: "#ffb3a7" })
  })

  it("clear-portrait は必須でない表情（proud / flustered）だけを受け付ける", () => {
    expect(
      parseClientCommand({ type: "clear-portrait", commandId: "c-8", expression: "proud" }),
    ).toEqual({ type: "clear-portrait", commandId: "c-8", expression: "proud" })
    expect(
      parseClientCommand({ type: "clear-portrait", commandId: "c-8", expression: "flustered" }),
    ).toBeDefined()
  })

  // **必須の2つ（`docs/requirements.md` 4.4 / characters/README.md）を消す操作は境界で弾く。**
  it("clear-portrait で default / working を消そうとすると undefined（必須の2つは消せない）", () => {
    expect(
      parseClientCommand({ type: "clear-portrait", commandId: "c-8", expression: "default" }),
    ).toBeUndefined()
    expect(
      parseClientCommand({ type: "clear-portrait", commandId: "c-8", expression: "working" }),
    ).toBeUndefined()
  })

  it("知らない表情・衣装、16進でない色、data URL でない画像は undefined", () => {
    expect(
      parseClientCommand({
        type: "set-portrait",
        commandId: "c-6",
        expression: "angry",
        image: TINY_PNG_DATA_URL,
      }),
    ).toBeUndefined()
    expect(
      parseClientCommand({
        type: "set-portrait",
        commandId: "c-6",
        expression: "proud",
        image: "https://example.com/portrait.png",
      }),
    ).toBeUndefined()
    expect(
      parseClientCommand({
        type: "set-outfit-accent",
        commandId: "c-7",
        outfit: "battle",
        color: "#ffb3a7",
      }),
    ).toBeUndefined()
    expect(
      parseClientCommand({
        type: "set-outfit-accent",
        commandId: "c-7",
        outfit: "heavy",
        color: "rebeccapurple",
      }),
    ).toBeUndefined()
  })

  it("上限を超えた大きさの立ち絵は undefined", () => {
    const tooLarge = `data:image/png;base64,${"A".repeat(Math.ceil((MAX_PORTRAIT_BYTES / 3) * 4) + 8)}`

    expect(
      parseClientCommand({
        type: "set-portrait",
        commandId: "c-6",
        expression: "proud",
        image: tooLarge,
      }),
    ).toBeUndefined()
  })

  it("isCharacterEditCommand が見た目の3つだけを true にする", () => {
    const edits = [
      { type: "set-portrait", commandId: "c-1", expression: "proud", image: TINY_PNG_DATA_URL },
      { type: "clear-portrait", commandId: "c-2", expression: "proud" },
      { type: "set-outfit-accent", commandId: "c-3", outfit: "light", color: "#a8e6c0" },
    ]
    const others = [
      { type: "interrupt", commandId: "c-4" },
      { type: "switch-character", commandId: "c-5", name: "tsukumo" },
    ]

    for (const value of edits) {
      const command = parseClientCommand(value)
      expect(command !== undefined && isCharacterEditCommand(command)).toBe(true)
    }
    for (const value of others) {
      const command = parseClientCommand(value)
      expect(command !== undefined && isCharacterEditCommand(command)).toBe(false)
    }
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
