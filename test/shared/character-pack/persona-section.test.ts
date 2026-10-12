import { describe, expect, it } from "vitest"

import {
  personaBody,
  personaWithBody,
  REMEMBERED_SECTION_HEADING,
} from "../../../src/shared/character-pack/persona-section.ts"

const SECTION = `${REMEMBERED_SECTION_HEADING}\n\n- 一つ目\n- 二つ目\n`

describe("personaBody", () => {
  it("節が無ければ全文（末尾の空白だけ落とす）", () => {
    expect(personaBody("# 人格\n\n本文\n\n")).toBe("# 人格\n\n本文")
  })

  it("節があれば節より前だけ", () => {
    expect(personaBody(`# 人格\n\n本文\n\n${SECTION}`)).toBe("# 人格\n\n本文")
  })

  it("見出しだけの違う行は節に数えない", () => {
    const content = "本文\n\n## 覚えたことメモ\n\n中身\n"
    expect(personaBody(content)).toBe(content.trimEnd())
  })

  it("本文が空で節だけのファイルは空", () => {
    expect(personaBody(SECTION)).toBe("")
  })
})

describe("personaWithBody", () => {
  it("本文を差し替えても節は1バイトも変わらない", () => {
    const next = personaWithBody(`古い本文\n\n${SECTION}`, "新しい本文\n\n")
    expect(next).toBe(`新しい本文\n\n${SECTION}`)
  })

  it("節が無いファイルには本文だけを書く", () => {
    expect(personaWithBody("古い", "新しい")).toBe("新しい\n")
  })

  it("中身が無い（persona.md が無い）ときも本文だけを書く", () => {
    expect(personaWithBody("", "新しい")).toBe("新しい\n")
  })

  it("本文を空にすると節だけが残る", () => {
    expect(personaWithBody(`古い\n\n${SECTION}`, "  \n")).toBe(SECTION)
  })

  it("読んで書き戻すと本文が変わらない", () => {
    const content = `# 人格\n\n本文\n\n${SECTION}`
    expect(personaBody(personaWithBody(content, personaBody(content)))).toBe(personaBody(content))
    expect(personaWithBody(content, personaBody(content))).toBe(content)
  })
})
