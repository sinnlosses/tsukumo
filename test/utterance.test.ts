import { describe, expect, it } from "bun:test"

import { splitUtterance } from "../src/utterance.ts"

// すべて手で書いた架空の発話。実物の会話は使わない
// （docs/coding-standards.md「会話内容の扱い」）。

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
