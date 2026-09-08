import { describe, expect, it } from "bun:test"

import { extractLatestUtterance } from "../src/transcript.ts"

// すべて手で書いた架空の会話。実物の transcript は使わない
// （docs/coding-standards.md「会話内容の扱い」）。

describe("extractLatestUtterance", () => {
  it("assistant の発話を取り出す", () => {
    const content = [
      JSON.stringify({
        type: "user",
        message: { content: [{ type: "text", text: "こんにちは" }] },
      }),
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "text", text: "やあ、今日は何をする?" }] },
      }),
    ].join("\n")

    expect(extractLatestUtterance(content)).toBe("やあ、今日は何をする?")
  })

  it("複数の assistant 発話があるとき、最新のものを返す", () => {
    const content = [
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "text", text: "最初の発話" }] },
      }),
      JSON.stringify({ type: "user", message: { content: [{ type: "text", text: "続けて" }] } }),
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "text", text: "最新の発話" }] },
      }),
    ].join("\n")

    expect(extractLatestUtterance(content)).toBe("最新の発話")
  })

  it("assistant の content に tool_use が混ざっていても text だけを拾う", () => {
    const content = JSON.stringify({
      type: "assistant",
      message: {
        content: [
          { type: "tool_use", name: "Bash", input: {} },
          { type: "text", text: "コマンドを実行するね" },
        ],
      },
    })

    expect(extractLatestUtterance(content)).toBe("コマンドを実行するね")
  })

  it("assistant の content に thinking が混ざっていても text だけを拾う", () => {
    const content = JSON.stringify({
      type: "assistant",
      message: {
        content: [
          { type: "thinking", thinking: "内部の思考。ここは画面に出してはいけない" },
          { type: "text", text: "考えがまとまったよ" },
        ],
      },
    })

    expect(extractLatestUtterance(content)).toBe("考えがまとまったよ")
  })

  it("assistant の content が thinking だけのとき、発話として扱わない", () => {
    const content = [
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "text", text: "直前の発話" }] },
      }),
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "thinking", thinking: "画面に出してはいけない思考" }] },
      }),
    ].join("\n")

    expect(extractLatestUtterance(content)).toBe("直前の発話")
  })

  it("assistant 以外の未知の type が混ざっていても落ちずに無視する", () => {
    const content = [
      JSON.stringify({ type: "mode", value: "plan" }),
      JSON.stringify({ type: "ai-title", title: "架空のタイトル" }),
      JSON.stringify({ type: "future-feature", payload: { anything: true } }),
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "text", text: "唯一の発話" }] },
      }),
    ].join("\n")

    expect(extractLatestUtterance(content)).toBe("唯一の発話")
  })

  it("壊れた行（JSONとして不正）が混ざっていても落ちずに残りを読む", () => {
    const content = [
      "{not valid json",
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "text", text: "壊れた行の後の発話" }] },
      }),
    ].join("\n")

    expect(extractLatestUtterance(content)).toBe("壊れた行の後の発話")
  })

  it("assistant だが content や message の形が壊れていても落ちない", () => {
    const content = [
      JSON.stringify({ type: "assistant" }),
      JSON.stringify({ type: "assistant", message: "文字列で壊れている" }),
      JSON.stringify({ type: "assistant", message: { content: "配列じゃない" } }),
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "text", text: "壊れた行の後の唯一の発話" }] },
      }),
    ].join("\n")

    expect(extractLatestUtterance(content)).toBe("壊れた行の後の唯一の発話")
  })

  it("空行だけの transcript では undefined を返す", () => {
    expect(extractLatestUtterance("\n\n")).toBeUndefined()
  })

  it("assistant の発話がまだ無いとき undefined を返す", () => {
    const content = JSON.stringify({
      type: "user",
      message: { content: [{ type: "text", text: "はじめまして" }] },
    })

    expect(extractLatestUtterance(content)).toBeUndefined()
  })
})
