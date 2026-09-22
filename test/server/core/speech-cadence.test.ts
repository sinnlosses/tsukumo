import { describe, expect, it } from "bun:test"

import {
  buildSystemPromptAppend,
  type CharacterPack,
} from "../../../src/server/adapter/character-pack.ts"
import { REPORT_NOTATION_PROMPT } from "../../../src/server/core/report-notation.ts"
import { SPEECH_CADENCE_PROMPT } from "../../../src/server/core/speech-cadence.ts"

// `buildSystemPromptAppend` を adapter から引くのは、あの関数が fs に触らなくても
// `adapter/character-pack.ts` に置くと決めたため（docs/architecture.md「新しいコードを置く場所」）。
//
// この規約は**パックによらず同じもの**（docs/requirements.md 4.2）。文面そのものではなく、
// **どのパックの append にも載ること**を見る（人格が無いパックで落ちると、そのパックだけ
// 吹き出しが止まる）。

/** 人格は手で書いた架空の一文だけ（docs/coding-standards.md「会話内容の扱い」）。 */
const PERSONA = "# 架空の精霊\n\n語尾に「なのじゃ」と付ける。"

function pack(persona: string | undefined): CharacterPack {
  return { name: "架空", dir: "/tmp/架空", definition: undefined, persona, revision: undefined }
}

describe("SPEECH_CADENCE_PROMPT", () => {
  it("人格のあるパックの append に、人格とレポートの記法の間で載る", () => {
    const append = buildSystemPromptAppend(pack(PERSONA), [
      SPEECH_CADENCE_PROMPT,
      REPORT_NOTATION_PROMPT,
    ])

    expect(append.indexOf(PERSONA)).toBeGreaterThanOrEqual(0)
    expect(append.indexOf(SPEECH_CADENCE_PROMPT)).toBeGreaterThan(append.indexOf(PERSONA))
    expect(append.indexOf(REPORT_NOTATION_PROMPT)).toBeGreaterThan(
      append.indexOf(SPEECH_CADENCE_PROMPT),
    )
  })

  it("人格が無いパックの append にも載る（どのパックでも黙りっぱなしにしない）", () => {
    const append = buildSystemPromptAppend(pack(undefined), [
      SPEECH_CADENCE_PROMPT,
      REPORT_NOTATION_PROMPT,
    ])

    expect(append).toContain(SPEECH_CADENCE_PROMPT)
  })

  it("回数の目安を持つのはこちらで、レポートの記法の側には無い", () => {
    // 正典を2つにしない（persona.md からも移した）。
    expect(SPEECH_CADENCE_PROMPT).toContain("1ターンに5〜10回")
    expect(REPORT_NOTATION_PROMPT).not.toContain("5〜10回")
  })

  it("委譲中の間合い（背景委譲・合図の形式）を持ち、append に載る", () => {
    // 文面の全文は写さず、決めた4点（背景委譲・間隔・合図の形式）が入っているかだけを見る
    // （フォアグラウンドの委譲は吹き出しを数分止める）。
    const append = buildSystemPromptAppend(pack(PERSONA), [
      SPEECH_CADENCE_PROMPT,
      REPORT_NOTATION_PROMPT,
    ])

    expect(SPEECH_CADENCE_PROMPT).toContain("run_in_background")
    expect(SPEECH_CADENCE_PROMPT).toContain("状況 | n/N")
    expect(append).toContain("run_in_background")
  })
})
