import { describe, expect, it } from "bun:test"

import { isJapaneseProse } from "../../src/shared/japanese-prose.ts"

describe("isJapaneseProse", () => {
  it("識別子やコードが多くても、地の文が日本語なら日本語と見る", () => {
    const report = [
      "`createSessionManager(options)` が持ち物をそのまま返す形にした。",
      "",
      "| 論点 | 答え |",
      "| --- | --- |",
      "| 鍵 | `Map` と `create` を消した |",
      "",
      "```diff src/shared/frame.ts",
      "-export const PROTOCOL_VERSION = 7",
      "+export const PROTOCOL_VERSION = 8",
      "```",
      "",
      '<div class="note note-warn">古いタブは手で読み込み直す。</div>',
      "",
      "bun run check が通った（1717 pass / 0 fail）。",
    ].join("\n")

    expect(isJapaneseProse(report)).toBe(true)
  })

  it("日本語を引用で少し含むだけの英語の本文は、日本語と見ない", () => {
    // 日本語のレポートを書いたあとに、同じ内容の英訳を締めの本文として書き足した実例の形。
    const report = [
      "I've completed the task and merged it, and the full check passes.",
      "",
      "| Question | Decision | Why |",
      "| --- | --- | --- |",
      "| How to drop the key | Removed the `Map` | Callers hold the object directly |",
      "",
      "The old tabs won't show the 「読み込み直して」 notice, so reload them by hand.",
    ].join("\n")

    expect(isJapaneseProse(report)).toBe(false)
  })

  it("コードだけで地の文が無い本文は、日本語の側に倒す", () => {
    expect(isJapaneseProse("```ts\nconst answer = 42\n```")).toBe(true)
    expect(isJapaneseProse("`bun run check`")).toBe(true)
  })

  it("URL の英字は数えない", () => {
    expect(
      isJapaneseProse("手順は https://example.com/docs/getting-started-with-the-tool にある。"),
    ).toBe(true)
  })
})
