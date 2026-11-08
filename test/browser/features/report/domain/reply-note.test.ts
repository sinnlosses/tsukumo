import { describe, expect, it } from "vitest"

import {
  claimNoteBody,
  optionNoteBody,
} from "../../../../../src/browser/features/report/domain/reply-note.ts"
import { sameReplyKey } from "../../../../../src/shared/session/reply-target.ts"

describe("付箋の中身の定型", () => {
  it("案は「この案で進めて。」", () => {
    expect(optionNoteBody()).toBe("この案で進めて。")
  })

  it("主張は確かめ方を添える", () => {
    expect(claimNoteBody("架空のログを見る")).toBe("確かめて。確かめ方: 架空のログを見る")
  })

  it("確かめ方が空白だけなら「確かめて。」だけ", () => {
    expect(claimNoteBody("  \n")).toBe("確かめて。")
    expect(claimNoteBody("")).toBe("確かめて。")
  })
})

describe("sameReplyKey", () => {
  const base = { reportToolUseId: "t1", componentId: "c1" }

  it("3つの欄が揃えば同じ所", () => {
    expect(sameReplyKey({ ...base, rowIndex: 1 }, { ...base, rowIndex: 1 })).toBe(true)
    expect(sameReplyKey(base, base)).toBe(true)
  })

  it("rowIndex・componentId・reportToolUseId のどれかが違えば別の所", () => {
    expect(sameReplyKey({ ...base, rowIndex: 1 }, { ...base, rowIndex: 2 })).toBe(false)
    expect(sameReplyKey({ ...base, rowIndex: 0 }, base)).toBe(false)
    expect(sameReplyKey(base, { ...base, componentId: "c2" })).toBe(false)
    expect(sameReplyKey(base, { ...base, reportToolUseId: "t2" })).toBe(false)
  })
})
