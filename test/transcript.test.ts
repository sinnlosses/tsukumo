import { describe, expect, it } from "bun:test"

import {
  extractContextUsage,
  extractLatestPendingBackgroundAgentCount,
  extractLatestUtterance,
  extractMainViewEntries,
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
  const MARKER = "アスナ: "

  it("マーカーで始まる行がセリフに、それ以外が詳細になる", () => {
    const utterance = [
      "アスナ: やあ、今日は何をする?",
      "手順はこう:",
      "1. テストを書く",
      "2. 実装する",
    ].join("\n")

    expect(splitUtterance(utterance, MARKER)).toEqual({
      speech: "やあ、今日は何をする?",
      detail: ["手順はこう:", "1. テストを書く", "2. 実装する"].join("\n"),
    })
  })

  it("連続するマーカー行は1つのまとまりとして改行でつなぐ", () => {
    const utterance = ["アスナ: 1行目のセリフ", "アスナ: 2行目のセリフ", "詳細はこちら"].join("\n")

    expect(splitUtterance(utterance, MARKER)).toEqual({
      speech: "1行目のセリフ\n2行目のセリフ",
      detail: "詳細はこちら",
    })
  })

  it("離れたまとまり（冒頭と締め）は空行でつなぐ", () => {
    const utterance = [
      "アスナ: よし、始めよう",
      "変更点:",
      "- Aを直した",
      "- Bを直した",
      "アスナ: 終わったよ",
    ].join("\n")

    expect(splitUtterance(utterance, MARKER)).toEqual({
      speech: "よし、始めよう\n\n終わったよ",
      detail: ["変更点:", "- Aを直した", "- Bを直した"].join("\n"),
    })
  })

  it("マーカーが1つも無いとき、セリフは undefined で詳細は全文になる", () => {
    const utterance = ["ただの説明文だけ。", "セリフの記法は使っていない。"].join("\n")

    expect(splitUtterance(utterance, MARKER)).toEqual({
      speech: undefined,
      detail: utterance,
    })
  })

  it("コードブロック内のマーカー行を拾わない", () => {
    const utterance = [
      "アスナ: 直したよ",
      "```diff",
      "アスナ: - old line",
      "アスナ: + new line",
      "```",
      "これで直るはず",
    ].join("\n")

    expect(splitUtterance(utterance, MARKER)).toEqual({
      speech: "直したよ",
      detail: ["```diff", "アスナ: - old line", "アスナ: + new line", "```", "これで直るはず"].join(
        "\n",
      ),
    })
  })

  it("コードブロックが複数あっても、ブロックの外のマーカー行だけを拾う", () => {
    const utterance = [
      "```ts",
      "アスナ: not a speech",
      "```",
      "アスナ: 本物のセリフ",
      "```bash",
      "アスナ: echo hi",
      "```",
    ].join("\n")

    expect(splitUtterance(utterance, MARKER)).toEqual({
      speech: "本物のセリフ",
      detail: ["```ts", "アスナ: not a speech", "```", "```bash", "アスナ: echo hi", "```"].join(
        "\n",
      ),
    })
  })

  it("引用（`> `）はセリフにならず、詳細にそのまま残る", () => {
    const utterance = [
      "アスナ: レビューのコメントを引くね",
      "> ここは分かりにくい、と言われた",
      "なので言い回しを変えた",
    ].join("\n")

    expect(splitUtterance(utterance, MARKER)).toEqual({
      speech: "レビューのコメントを引くね",
      detail: ["> ここは分かりにくい、と言われた", "なので言い回しを変えた"].join("\n"),
    })
  })

  it("マーカーを差し替えると、差し替えた側で拾う", () => {
    const utterance = ["ゆき> こっちが新しいマーカー", "アスナ: こっちはただの本文"].join("\n")

    expect(splitUtterance(utterance, "ゆき> ")).toEqual({
      speech: "こっちが新しいマーカー",
      detail: "アスナ: こっちはただの本文",
    })
  })

  it("マーカーは行頭での一致だけを見る（行の途中にあっても拾わない）", () => {
    const utterance = "この行の途中に アスナ: があっても詳細のまま"

    expect(splitUtterance(utterance, MARKER)).toEqual({
      speech: undefined,
      detail: utterance,
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

describe("extractMainViewEntries", () => {
  const MARKER = "アスナ: "

  it("tool_use と、対応する tool_result（tool_use_id で対応付け）を1件のツール実行にする", () => {
    const content = [
      JSON.stringify({
        type: "assistant",
        message: {
          content: [
            { type: "tool_use", id: "toolu_1", name: "Bash", input: { command: "echo hi" } },
          ],
        },
      }),
      JSON.stringify({
        type: "user",
        message: {
          content: [
            { type: "tool_result", tool_use_id: "toolu_1", content: "hi", is_error: false },
          ],
        },
        toolUseResult: { stdout: "hi", stderr: "", interrupted: false },
      }),
    ].join("\n")

    expect(extractMainViewEntries(content, MARKER)).toEqual([
      {
        kind: "tool",
        name: "Bash",
        input: { command: "echo hi" },
        result: { content: "hi", isError: false },
      },
    ])
  })

  it("結果がまだ届いていないツールは result が undefined になる（作業中）", () => {
    const content = JSON.stringify({
      type: "assistant",
      message: {
        content: [{ type: "tool_use", id: "toolu_1", name: "Read", input: { file_path: "/a" } }],
      },
    })

    expect(extractMainViewEntries(content, MARKER)).toEqual([
      { kind: "tool", name: "Read", input: { file_path: "/a" }, result: undefined },
    ])
  })

  it("エラーになったツールは isError が true になる", () => {
    const content = [
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "tool_use", id: "toolu_1", name: "Bash", input: {} }] },
      }),
      JSON.stringify({
        type: "user",
        message: {
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_1",
              content: "command not found",
              is_error: true,
            },
          ],
        },
      }),
    ].join("\n")

    expect(extractMainViewEntries(content, MARKER)).toEqual([
      {
        kind: "tool",
        name: "Bash",
        input: {},
        result: { content: "command not found", isError: true },
      },
    ])
  })

  it("tool_result の content が複数ブロックの配列のとき、text ブロックをつなぐ", () => {
    const content = [
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "tool_use", id: "toolu_1", name: "Read", input: {} }] },
      }),
      JSON.stringify({
        type: "user",
        message: {
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_1",
              content: [
                { type: "text", text: "1行目" },
                { type: "text", text: "2行目" },
              ],
            },
          ],
        },
      }),
    ].join("\n")

    expect(extractMainViewEntries(content, MARKER)).toEqual([
      {
        kind: "tool",
        name: "Read",
        input: {},
        result: { content: "1行目\n\n2行目", isError: false },
      },
    ])
  })

  it("text は splitUtterance の detail だけを積み、セリフは含めない", () => {
    const content = JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "text", text: "アスナ: やったよ\n詳しい説明はこちら" }] },
    })

    expect(extractMainViewEntries(content, MARKER)).toEqual([
      { kind: "detail", markdown: "詳しい説明はこちら" },
    ])
  })

  it("セリフだけで detail が空になる発話は積まない", () => {
    const content = JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "text", text: "アスナ: セリフだけ" }] },
    })

    expect(extractMainViewEntries(content, MARKER)).toEqual([])
  })

  it("thinking は絶対に出さない（中身が結果に一切現れない）", () => {
    const content = [
      JSON.stringify({
        type: "assistant",
        message: {
          content: [
            { type: "thinking", thinking: "秘密の内部思考。画面に出したら事故になる" },
            { type: "tool_use", id: "toolu_1", name: "Bash", input: { command: "ls" } },
          ],
        },
      }),
      JSON.stringify({
        type: "user",
        message: {
          content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "a.txt" }],
        },
      }),
    ].join("\n")

    const serialized = JSON.stringify(extractMainViewEntries(content, MARKER))
    expect(serialized).not.toContain("秘密の内部思考")
    expect(serialized).not.toContain("thinking")
  })

  it("1行の中で tool_use とテキストが混ざっているとき、出現順のまま両方を積む", () => {
    const content = JSON.stringify({
      type: "assistant",
      message: {
        content: [
          { type: "tool_use", id: "toolu_1", name: "Bash", input: { command: "ls" } },
          { type: "text", text: "アスナ: 見てみるね\n実行した結果はこちら" },
        ],
      },
    })

    expect(extractMainViewEntries(content, MARKER)).toEqual([
      { kind: "tool", name: "Bash", input: { command: "ls" }, result: undefined },
      { kind: "detail", markdown: "実行した結果はこちら" },
    ])
  })

  it("利用者が打った依頼（user 行の content が文字列）を、やり取りの境目として積む", () => {
    const content = [
      JSON.stringify({ type: "user", message: { content: "T-019 やろうか" } }),
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "text", text: "アスナ: やるよ\n読んだ結果" }] },
      }),
    ].join("\n")

    expect(extractMainViewEntries(content, MARKER)).toEqual([
      { kind: "request", text: "T-019 やろうか" },
      { kind: "detail", markdown: "読んだ結果" },
    ])
  })

  it("ツールの結果を返す user 行（content が配列）は依頼にしない", () => {
    const content = JSON.stringify({
      type: "user",
      message: { content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "ok" }] },
      toolUseResult: { stdout: "ok" },
    })

    expect(extractMainViewEntries(content, MARKER)).toEqual([])
  })

  it("システムが挿入した user 行（isMeta）は依頼にしない", () => {
    const content = JSON.stringify({
      type: "user",
      isMeta: true,
      message: { content: "<command-name>/next-task</command-name>" },
    })

    expect(extractMainViewEntries(content, MARKER)).toEqual([])
  })

  it("空白だけの依頼は境目にしない", () => {
    const content = JSON.stringify({ type: "user", message: { content: "   \n  " } })

    expect(extractMainViewEntries(content, MARKER)).toEqual([])
  })

  it("壊れた行・未知の type が混ざっていても落ちずに読む", () => {
    const content = [
      "{not valid json",
      JSON.stringify({ type: "future-type", payload: { anything: true } }),
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "text", text: "アスナ: 唯一のセリフ\n唯一の詳細" }] },
      }),
    ].join("\n")

    expect(extractMainViewEntries(content, MARKER)).toEqual([
      { kind: "detail", markdown: "唯一の詳細" },
    ])
  })

  it("空の transcript では空配列を返す", () => {
    expect(extractMainViewEntries("", MARKER)).toEqual([])
  })
})
