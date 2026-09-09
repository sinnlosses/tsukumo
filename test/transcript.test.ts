import { describe, expect, it } from "bun:test"

import {
  extractContextUsage,
  extractLatestPendingBackgroundAgentCount,
  extractLatestUtterance,
  splitUtterance,
} from "../src/transcript.ts"

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

describe("splitUtterance", () => {
  it("引用が1箇所のとき、セリフと詳細に分ける", () => {
    const utterance = [
      "> やあ、今日は何をする?",
      "手順はこう:",
      "1. テストを書く",
      "2. 実装する",
    ].join("\n")

    expect(splitUtterance(utterance)).toEqual({
      speech: "やあ、今日は何をする?",
      detail: ["手順はこう:", "1. テストを書く", "2. 実装する"].join("\n"),
    })
  })

  it("連続する引用行は1つのまとまりとして改行でつなぐ", () => {
    const utterance = ["> 1行目のセリフ", "> 2行目のセリフ", "詳細はこちら"].join("\n")

    expect(splitUtterance(utterance)).toEqual({
      speech: "1行目のセリフ\n2行目のセリフ",
      detail: "詳細はこちら",
    })
  })

  it("引用が複数箇所（冒頭と締め）に分かれているとき、出現順に連結する", () => {
    const utterance = [
      "> よし、始めよう",
      "変更点:",
      "- Aを直した",
      "- Bを直した",
      "> 終わったよ",
    ].join("\n")

    expect(splitUtterance(utterance)).toEqual({
      speech: "よし、始めよう\n\n終わったよ",
      detail: ["変更点:", "- Aを直した", "- Bを直した"].join("\n"),
    })
  })

  it("引用が1つも無いとき、セリフは undefined で詳細は全文になる", () => {
    const utterance = ["ただの説明文だけ。", "引用の記法は使っていない。"].join("\n")

    expect(splitUtterance(utterance)).toEqual({
      speech: undefined,
      detail: utterance,
    })
  })

  it("コードブロック内の `> ` を引用として拾わない", () => {
    const utterance = [
      "> 直したよ",
      "```diff",
      "> - old line",
      "> + new line",
      "```",
      "これで直るはず",
    ].join("\n")

    expect(splitUtterance(utterance)).toEqual({
      speech: "直したよ",
      detail: ["```diff", "> - old line", "> + new line", "```", "これで直るはず"].join("\n"),
    })
  })

  it("コードブロックが複数あっても、ブロックの外の引用だけを拾う", () => {
    const utterance = [
      "```ts",
      "> not a quote",
      "```",
      "> 本物のセリフ",
      "```bash",
      "> echo hi",
      "```",
    ].join("\n")

    expect(splitUtterance(utterance)).toEqual({
      speech: "本物のセリフ",
      detail: ["```ts", "> not a quote", "```", "```bash", "> echo hi", "```"].join("\n"),
    })
  })

  it("ネストした引用（`> >`）は外側の `> ` だけを取り除く", () => {
    const utterance = ["> > 入れ子の引用", "詳細の説明"].join("\n")

    expect(splitUtterance(utterance)).toEqual({
      speech: "> 入れ子の引用",
      detail: "詳細の説明",
    })
  })
})

describe("extractContextUsage", () => {
  it("最新の assistant 行の usage からトークン数の合計を取り出す", () => {
    const content = [
      JSON.stringify({
        type: "assistant",
        message: {
          content: [{ type: "text", text: "最初の発話" }],
          usage: { input_tokens: 1, cache_read_input_tokens: 10, cache_creation_input_tokens: 100 },
        },
      }),
      JSON.stringify({
        type: "assistant",
        message: {
          content: [{ type: "text", text: "最新の発話" }],
          usage: {
            input_tokens: 2,
            cache_read_input_tokens: 603_400,
            cache_creation_input_tokens: 5,
          },
        },
      }),
    ].join("\n")

    expect(extractContextUsage(content)).toBe(603_407)
  })

  it("最新の assistant 行が tool_use だけでも usage があれば拾う", () => {
    const content = JSON.stringify({
      type: "assistant",
      message: {
        content: [{ type: "tool_use", name: "Bash", input: { command: "echo hi" } }],
        usage: { input_tokens: 1, cache_read_input_tokens: 2, cache_creation_input_tokens: 3 },
      },
    })

    expect(extractContextUsage(content)).toBe(6)
  })

  it("assistant 行が1つも無いとき undefined を返す", () => {
    const content = JSON.stringify({
      type: "user",
      message: { content: [{ type: "text", text: "はじめまして" }] },
    })

    expect(extractContextUsage(content)).toBeUndefined()
  })

  it("最新の assistant 行に usage が無いとき undefined を返す（残量%を捏造しない）", () => {
    const content = JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "text", text: "usage が無い発話" }] },
    })

    expect(extractContextUsage(content)).toBeUndefined()
  })

  it("usage の値が数値でないとき undefined を返す", () => {
    const content = JSON.stringify({
      type: "assistant",
      message: {
        content: [{ type: "text", text: "壊れた usage" }],
        usage: { input_tokens: "1", cache_read_input_tokens: 2, cache_creation_input_tokens: 3 },
      },
    })

    expect(extractContextUsage(content)).toBeUndefined()
  })

  it("壊れた行が混ざっていても落ちずに読む", () => {
    const content = [
      "{not valid json",
      JSON.stringify({
        type: "assistant",
        message: {
          content: [{ type: "text", text: "壊れた行の後の発話" }],
          usage: { input_tokens: 1, cache_read_input_tokens: 1, cache_creation_input_tokens: 1 },
        },
      }),
    ].join("\n")

    expect(extractContextUsage(content)).toBe(3)
  })
})

describe("extractLatestPendingBackgroundAgentCount", () => {
  it("system 行の pendingBackgroundAgentCount のうち最新の値を返す", () => {
    const content = [
      JSON.stringify({ type: "system", subtype: "turn_duration", pendingBackgroundAgentCount: 2 }),
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "text", text: "作業中" }] },
      }),
      JSON.stringify({ type: "system", subtype: "turn_duration", pendingBackgroundAgentCount: 1 }),
    ].join("\n")

    expect(extractLatestPendingBackgroundAgentCount(content)).toBe(1)
  })

  it("system 行はあるが pendingBackgroundAgentCount を持つ行が1つも無いとき undefined を返す", () => {
    const content = JSON.stringify({ type: "system", subtype: "stop_hook_summary", hookCount: 1 })

    expect(extractLatestPendingBackgroundAgentCount(content)).toBeUndefined()
  })

  it("system 行が1つも無いとき undefined を返す", () => {
    const content = JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "text", text: "こんにちは" }] },
    })

    expect(extractLatestPendingBackgroundAgentCount(content)).toBeUndefined()
  })

  it("壊れた行・未知の type が混ざっていても落ちずに読む", () => {
    const content = [
      "{not valid json",
      JSON.stringify({ type: "future-type", pendingBackgroundAgentCount: 99 }),
      JSON.stringify({ type: "system", subtype: "turn_duration", pendingBackgroundAgentCount: 3 }),
    ].join("\n")

    expect(extractLatestPendingBackgroundAgentCount(content)).toBe(3)
  })
})
