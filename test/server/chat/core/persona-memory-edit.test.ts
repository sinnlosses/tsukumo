import { describe, expect, it } from "vitest"

import {
  forgetRejection,
  forgetTarget,
  personaWithoutRememberedLine,
  personaWithRememberedLine,
  rememberedTexts,
  rememberRejection,
} from "../../../../src/server/chat/core/persona-memory-edit.ts"

const HEADING = "## 覚えたこと"

describe("rememberRejection", () => {
  const open = { turnUsed: false, line: "架空の好み", editable: true, remembered: [] }

  it("断る理由が無ければ undefined", () => {
    expect(rememberRejection(open)).toBeUndefined()
  })

  it("判定の順は turn-used → unwritable-line → not-editable → duplicate", () => {
    const all = { turnUsed: true, line: "", editable: false, remembered: [""] }
    expect(rememberRejection(all)).toBe("turn-used")
    expect(rememberRejection({ ...all, turnUsed: false })).toBe("unwritable-line")
    expect(rememberRejection({ ...all, turnUsed: false, line: "a" })).toBe("not-editable")
    expect(rememberRejection({ ...open, remembered: [" 架空の好み "] })).toBe("duplicate")
  })

  it("改行入りと長すぎる行は書けない", () => {
    expect(rememberRejection({ ...open, line: "a\nb" })).toBe("unwritable-line")
    expect(rememberRejection({ ...open, line: "あ".repeat(1000) })).toBe("unwritable-line")
  })
})

describe("forgetRejection", () => {
  it("判定の順は turn-used → not-editable → no-match", () => {
    const all = { turnUsed: true, editable: false, target: "" }
    expect(forgetRejection(all)).toBe("turn-used")
    expect(forgetRejection({ ...all, turnUsed: false })).toBe("not-editable")
    expect(forgetRejection({ ...all, turnUsed: false, editable: true })).toBe("no-match")
    expect(forgetRejection({ turnUsed: false, editable: true, target: "x" })).toBeUndefined()
  })
})

describe("personaWithRememberedLine", () => {
  it("節が無ければ見出しごと末尾に作り、節より前は変えない", () => {
    expect(personaWithRememberedLine("本文", "一")).toBe(`本文\n\n${HEADING}\n\n- 一\n`)
    expect(personaWithRememberedLine("本文\n", "一")).toBe(`本文\n\n${HEADING}\n\n- 一\n`)
    expect(personaWithRememberedLine("本文\n\n", "一")).toBe(`本文\n\n${HEADING}\n\n- 一\n`)
  })

  it("節があれば末尾に足し、20行を超えたら古い行から落とす", () => {
    let content = "本文\n"
    for (let index = 0; index < 22; index += 1) {
      content = personaWithRememberedLine(content, `行${index}`)
    }
    const texts = rememberedTexts(content)
    expect(texts).toHaveLength(20)
    expect(texts[0]).toBe("行2")
    expect(texts.at(-1)).toBe("行21")
    expect(content.startsWith("本文\n")).toBe(true)
  })
})

describe("personaWithoutRememberedLine", () => {
  const content = `本文\n\n${HEADING}\n\n- 一\n- 二\n- 一\n`

  it("同じ文面が2行あれば古いほうを消す", () => {
    expect(personaWithoutRememberedLine(content, "一")).toBe(`本文\n\n${HEADING}\n\n- 二\n- 一\n`)
  })

  it("最後の1行を消すと見出しごと落ちる", () => {
    expect(personaWithoutRememberedLine(`本文\n\n${HEADING}\n\n- 一\n`, "一")).toBe("本文\n\n")
  })

  it("節が無い・一致しないときは undefined", () => {
    expect(personaWithoutRememberedLine("本文", "一")).toBeUndefined()
    expect(personaWithoutRememberedLine(content, "三")).toBeUndefined()
  })
})

describe("forgetTarget", () => {
  it("前後の空白と箇条書きの印を落とす", () => {
    expect(forgetTarget("  - 一 ")).toBe("一")
    expect(forgetTarget("一")).toBe("一")
    expect(forgetTarget("-")).toBe("-")
  })
})
