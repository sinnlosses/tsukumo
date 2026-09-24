import { describe, expect, it } from "bun:test"

import { REPORT_NOTATION_PROMPT } from "../../../src/server/core/report-notation.ts"
import { SPEECH_CADENCE_PROMPT } from "../../../src/server/core/speech-cadence.ts"
import { takeSystemPromptAppend } from "../../../src/server/core/system-prompt.ts"

// この規約は**パックによらず同じもの**（docs/display.md 4.2）。文面そのものではなく、
// **どのパックの append にも載ること**を見る（人格が無いパックで落ちると、そのパックだけ
// 吹き出しが止まる）。**並びそのものの正典は `test/server/core/system-prompt.test.ts`**
// （人格との前後関係と、人格が無いパックで規約だけになることは、そちらが append 全体の文字列
// として固定している。組み立てをそこへ寄せたときに、同じ分岐の重複としてここから外した）。

/** 人格は手で書いた架空の一文だけ（docs/coding-standards.md「会話内容の扱い」）。 */
const PERSONA = "# 架空の精霊\n\n語尾に「なのじゃ」と付ける。"

/** 仕事モードの append（人格は文字列で渡す。`src/server/core/system-prompt.ts`）。 */
function workAppend(persona: string): string {
  return takeSystemPromptAppend({ persona, mode: { kind: "work" } })
}

describe("SPEECH_CADENCE_PROMPT", () => {
  it("話す頻度を持つのはこちらで、レポートの記法の側には無い", () => {
    // 正典を2つにしない（persona.md からも移した）。
    expect(SPEECH_CADENCE_PROMPT).toContain("作業が長いターンほど間を空けない")
    expect(REPORT_NOTATION_PROMPT).not.toContain("間を空けない")
  })

  it("締めの speak は report を呼んだ直後に置き、書き終えたことを言う", () => {
    // `report` は呼び出しの時点で中身が確定するので、締めのセリフはそのあとに言える
    // （`report-notation.ts` の終わり方の条と揃える）。
    expect(SPEECH_CADENCE_PROMPT).toContain("`report` を呼んだ直後に締めの1回")
    expect(SPEECH_CADENCE_PROMPT).toContain("書き終えたことの一言")
    expect(SPEECH_CADENCE_PROMPT).not.toContain("書く直前")
    expect(SPEECH_CADENCE_PROMPT).not.toContain("これから何を書くかの予告")
  })

  it("委譲中の間合い（背景委譲・合図の形式）を持ち、append に載る", () => {
    // 文面の全文は写さず、決めた4点（背景委譲・間隔・合図の形式）が入っているかだけを見る
    // （フォアグラウンドの委譲は吹き出しを数分止める）。
    const append = workAppend(PERSONA)

    expect(SPEECH_CADENCE_PROMPT).toContain("run_in_background")
    expect(SPEECH_CADENCE_PROMPT).toContain("状況 | n/N")
    expect(append).toContain("run_in_background")
  })
})
