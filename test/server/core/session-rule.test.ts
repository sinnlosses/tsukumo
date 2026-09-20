import { describe, expect, it } from "bun:test"

import {
  buildSystemPromptAppend,
  type CharacterPack,
} from "../../../src/server/adapter/character-pack.ts"
import { CHAT_MANNER_PROMPT } from "../../../src/server/core/chat-manner.ts"
import { REPORT_NOTATION_PROMPT } from "../../../src/server/core/report-notation.ts"
import { sessionRules } from "../../../src/server/core/session-rule.ts"
import { SPEECH_CADENCE_PROMPT } from "../../../src/server/core/speech-cadence.ts"

// **雑談かどうかで `systemPrompt` の中身が入れ替わる**ことを、`src/cli.ts` が組み立てるのと
// 同じ道（`sessionRules` → `buildSystemPromptAppend`）で見る（docs/requirements.md 4.9）。
// `buildSystemPromptAppend` を adapter から引く理由は `speech-cadence.test.ts` と同じ。
//
// **本物の駆動を起こして確かめることはできない**（`systemPrompt` はセッションを起こすときに
// 固定され、あとから覗けない）。だから組み立ての側を見る。

/** 人格は手で書いた架空の一文だけ（docs/coding-standards.md「会話内容の扱い」）。 */
const PERSONA = "# 架空の精霊\n\n語尾に「なのじゃ」と付ける。"

const FIXTURE_PACK: CharacterPack = {
  name: "架空",
  dir: "/tmp/架空",
  definition: undefined,
  persona: PERSONA,
  revision: undefined,
}

describe("sessionRules", () => {
  it("仕事のときはレポートの記法とセリフの間合いが載り、雑談の作法は載らない", () => {
    const append = buildSystemPromptAppend(FIXTURE_PACK, sessionRules(false))

    expect(append).toContain(REPORT_NOTATION_PROMPT)
    expect(append).toContain(SPEECH_CADENCE_PROMPT)
    expect(append).not.toContain(CHAT_MANNER_PROMPT)
  })

  it("雑談のときはレポートの記法が載らない（仕事の2つと入れ替わる）", () => {
    const append = buildSystemPromptAppend(FIXTURE_PACK, sessionRules(true))

    expect(append).not.toContain(REPORT_NOTATION_PROMPT)
    expect(append).not.toContain(SPEECH_CADENCE_PROMPT)
    expect(append).toContain(CHAT_MANNER_PROMPT)
  })

  it("どちらのモードでも人格は載る（パックの口調は雑談でも変わらない）", () => {
    expect(buildSystemPromptAppend(FIXTURE_PACK, sessionRules(false))).toContain(PERSONA)
    expect(buildSystemPromptAppend(FIXTURE_PACK, sessionRules(true))).toContain(PERSONA)
  })

  it("雑談の作法は口調を決めない（口調はキャラクターパックの persona.md の担当）", () => {
    // 正典を2つにしない（`report-notation.ts` と同じ切り分け。docs/requirements.md 4.9）。
    expect(CHAT_MANNER_PROMPT).toContain("speak")
    expect(CHAT_MANNER_PROMPT).not.toContain("一人称")
  })
})
