import { describe, expect, it } from "bun:test"

import { chatLogByteSize, chatLogEntries } from "../../src/shared/chat-log.ts"
import { type SessionRecord } from "../../src/shared/session-state.ts"

// 雑談のログは**素直な時系列**（docs/design.md 13.7）。`mainViewEntries` のように依頼で
// まとめ直さないことを、並びと落とすものの2点で固定する。
//
// 文面は手で書いた架空のもの（docs/coding-standards.md「会話内容の扱い」）。

const RECORDS: readonly SessionRecord[] = [
  { kind: "request", text: "1つめの依頼", images: [] },
  { kind: "speech", text: "1つめのセリフ", expression: "default" },
  { kind: "request", text: "2つめの依頼", images: [] },
  { kind: "speech", text: "2つめのセリフ", expression: "proud" },
]

describe("chatLogEntries", () => {
  it("利用者の発言とセリフが、記録の順（古い→新しい）のまま交互に積む", () => {
    expect(chatLogEntries(RECORDS)).toEqual([
      { speaker: "user", text: "1つめの依頼", images: [] },
      { speaker: "character", text: "1つめのセリフ", expression: "default" },
      { speaker: "user", text: "2つめの依頼", images: [] },
      { speaker: "character", text: "2つめのセリフ", expression: "proud" },
    ])
  })

  it("本文・ツール・質問は落とす（雑談中はレポートを出さない）", () => {
    const entries = chatLogEntries([
      { kind: "request", text: "架空の依頼", images: [] },
      { kind: "detail", markdown: "## 架空のレポート" },
      {
        kind: "tool",
        toolUseId: "t-1",
        name: "Read",
        input: {},
        nested: false,
        result: undefined,
      },
      { kind: "question", questions: [], answers: [] },
      { kind: "speech", text: "架空のセリフ", expression: "default" },
    ])

    expect(entries.map((entry) => entry.speaker)).toEqual(["user", "character"])
  })

  it("表情はキャラクターの側にだけ付く（話者の印に使う）", () => {
    const entries = chatLogEntries(RECORDS)

    expect(entries[0]).not.toHaveProperty("expression")
    expect(entries[1]).toHaveProperty("expression", "default")
  })

  it("記録が空なら空（まだ何も話していない場面）", () => {
    expect(chatLogEntries([])).toEqual([])
  })
})

describe("chatLogByteSize", () => {
  it("空なら0", () => {
    expect(chatLogByteSize([])).toBe(0)
  })

  it("利用者だけの文面を UTF-8 バイト数で数える", () => {
    // "あ" は UTF-8 で3バイト。
    const entries = chatLogEntries([{ kind: "request", text: "あああ", images: [] }])

    expect(chatLogByteSize(entries)).toBe(9)
  })

  it("セリフだけの文面も数える", () => {
    const entries = chatLogEntries([
      { kind: "speech", text: "架空のセリフ", expression: "default" },
    ])

    expect(chatLogByteSize(entries)).toBe(new TextEncoder().encode("架空のセリフ").length)
  })

  it("画像つきの依頼でも、添えた画像は数えない", () => {
    const withImages = chatLogEntries([
      {
        kind: "request",
        text: "あああ",
        images: ["data:image/png;base64,architecture-tallying-decoy"],
      },
    ])
    const withoutImages = chatLogEntries([{ kind: "request", text: "あああ", images: [] }])

    expect(chatLogByteSize(withImages)).toBe(chatLogByteSize(withoutImages))
  })

  it("複数件は合算する", () => {
    const entries = chatLogEntries([
      { kind: "request", text: "1つめの依頼", images: [] },
      { kind: "speech", text: "1つめのセリフ", expression: "default" },
    ])

    expect(chatLogByteSize(entries)).toBe(
      new TextEncoder().encode("1つめの依頼").length +
        new TextEncoder().encode("1つめのセリフ").length,
    )
  })
})
