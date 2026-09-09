import { describe, expect, it } from "bun:test"

import { extractAgentMeta, extractLatestToolName } from "../src/subagents.ts"

// すべて手で書いた架空のサブエージェントの記録。実物の transcript は使わない
// （docs/coding-standards.md「会話内容の扱い」）。

describe("extractLatestToolName", () => {
  it("直近に使われたツールの名前を返す", () => {
    const content = [
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "tool_use", name: "Read", input: { file_path: "/a" } }] },
      }),
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "tool_use", name: "Bash", input: { command: "ls" } }] },
      }),
    ].join("\n")

    expect(extractLatestToolName(content)).toBe("Bash")
  })

  it("1つの行に複数の tool_use があるとき、最後のものを返す", () => {
    const content = JSON.stringify({
      type: "assistant",
      message: {
        content: [
          { type: "tool_use", name: "Read", input: {} },
          { type: "tool_use", name: "Edit", input: {} },
        ],
      },
    })

    expect(extractLatestToolName(content)).toBe("Edit")
  })

  it("text や thinking しか無い行は無視して、tool_use のある行まで遡らない範囲で最新を返す", () => {
    const content = [
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "tool_use", name: "Bash", input: {} }] },
      }),
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "text", text: "終わったよ" }] },
      }),
    ].join("\n")

    expect(extractLatestToolName(content)).toBe("Bash")
  })

  it("ツールが1つも使われていないとき undefined を返す", () => {
    const content = JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "text", text: "テキストだけの発話" }] },
    })

    expect(extractLatestToolName(content)).toBeUndefined()
  })

  it("assistant 以外の行や未知の type が混ざっていても落ちない", () => {
    const content = [
      JSON.stringify({ type: "user", message: { content: "架空のユーザー入力" } }),
      JSON.stringify({ type: "future-type", payload: { anything: true } }),
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "tool_use", name: "Grep", input: {} }] },
      }),
    ].join("\n")

    expect(extractLatestToolName(content)).toBe("Grep")
  })

  it("壊れた行（JSONとして不正）が混ざっていても落ちない", () => {
    const content = [
      "{not valid json",
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "tool_use", name: "Write", input: {} }] },
      }),
    ].join("\n")

    expect(extractLatestToolName(content)).toBe("Write")
  })

  it("assistant だが content や message の形が壊れていても落ちない", () => {
    const content = [
      JSON.stringify({ type: "assistant" }),
      JSON.stringify({ type: "assistant", message: "文字列で壊れている" }),
      JSON.stringify({ type: "assistant", message: { content: "配列じゃない" } }),
    ].join("\n")

    expect(extractLatestToolName(content)).toBeUndefined()
  })

  it("空の transcript では undefined を返す", () => {
    expect(extractLatestToolName("")).toBeUndefined()
  })
})

describe("extractAgentMeta", () => {
  it("description と model を取り出す", () => {
    const content = JSON.stringify({
      agentType: "general-purpose",
      description: "架空のタスクラベル",
      toolUseId: "toolu_dummy",
      spawnDepth: 1,
      model: "sonnet",
    })

    expect(extractAgentMeta(content)).toEqual({
      description: "架空のタスクラベル",
      model: "sonnet",
    })
  })

  it("JSON として不正なとき undefined を返す（meta.json が無いのと同じ扱い）", () => {
    expect(extractAgentMeta("{not valid json")).toBeUndefined()
  })

  it("トップレベルがオブジェクトでないとき undefined を返す", () => {
    expect(extractAgentMeta(JSON.stringify("ただの文字列"))).toBeUndefined()
  })

  it("description が文字列でないとき、その項目だけ undefined にする（model は活かす）", () => {
    const content = JSON.stringify({ description: 42, model: "opus" })

    expect(extractAgentMeta(content)).toEqual({ description: undefined, model: "opus" })
  })

  it("model が文字列でないとき、その項目だけ undefined にする（description は活かす）", () => {
    const content = JSON.stringify({ description: "架空のタスクラベル", model: null })

    expect(extractAgentMeta(content)).toEqual({
      description: "架空のタスクラベル",
      model: undefined,
    })
  })

  it("description・model がどちらも無いオブジェクトでも落ちない", () => {
    expect(extractAgentMeta(JSON.stringify({ agentType: "general-purpose" }))).toEqual({
      description: undefined,
      model: undefined,
    })
  })
})
