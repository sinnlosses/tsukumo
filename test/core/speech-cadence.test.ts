import { describe, expect, it } from "bun:test"

import { buildSystemPromptAppend, type CharacterPack } from "../../src/core/character-pack.ts"
import { REPORT_NOTATION_PROMPT } from "../../src/core/report-notation.ts"
import { SPEECH_CADENCE_PROMPT } from "../../src/core/speech-cadence.ts"

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
    // 正典を2つにしない（persona.md からも移した。2026-09-16 決定）。
    expect(SPEECH_CADENCE_PROMPT).toContain("1ターンに5〜10回")
    expect(REPORT_NOTATION_PROMPT).not.toContain("5〜10回")
  })
})
