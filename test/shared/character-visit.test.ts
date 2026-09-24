import { describe, expect, it } from "bun:test"

import { toCharacterVisit } from "../../src/shared/character-visit.ts"

describe("toCharacterVisit", () => {
  it("peek・farewell・scripts をそろえて持つ visit を読む", () => {
    const visit = toCharacterVisit({
      peek: "peek.png",
      farewell: ["またね", "また来るね"],
      scripts: [
        [
          { speaker: "guest", expression: "curious", text: "何してるの？" },
          { speaker: "host", expression: "proud", text: "見ての通りさ" },
        ],
      ],
    })

    expect(visit?.peek).toBe("peek.png")
    expect(visit?.farewell).toEqual(["またね", "また来るね"])
    expect(visit?.scripts).toEqual([
      [
        { speaker: "guest", expression: "curious", text: "何してるの？" },
        { speaker: "host", expression: "proud", text: "見ての通りさ" },
      ],
    ])
  })

  it("visit が無い定義は undefined（客にならない）", () => {
    expect(toCharacterVisit(undefined)).toBeUndefined()
  })

  it("peek と scripts を省いても farewell だけで読める", () => {
    const visit = toCharacterVisit({ farewell: ["じゃあね"] })

    expect(visit?.peek).toBeUndefined()
    expect(visit?.scripts).toEqual([])
    expect(visit?.farewell).toEqual(["じゃあね"])
  })

  it("visit がオブジェクトでないときは undefined", () => {
    expect(toCharacterVisit("visit")).toBeUndefined()
    expect(toCharacterVisit(["visit"])).toBeUndefined()
    expect(toCharacterVisit(null)).toBeUndefined()
  })

  it("farewell が無い・空・文字列以外の要素を含むときは visit ごと undefined", () => {
    expect(toCharacterVisit({})).toBeUndefined()
    expect(toCharacterVisit({ farewell: [] })).toBeUndefined()
    expect(toCharacterVisit({ farewell: "またね" })).toBeUndefined()
    expect(toCharacterVisit({ farewell: ["またね", 42] })).toBeUndefined()
    expect(toCharacterVisit({ farewell: ["   "] })).toBeUndefined()
  })

  it("scripts が配列でないときは空の台本として読む", () => {
    const visit = toCharacterVisit({ farewell: ["またね"], scripts: "not-an-array" })

    expect(visit?.scripts).toEqual([])
  })

  it("形の崩れた台本は一覧から落ち、崩れていない台本だけが残る", () => {
    const visit = toCharacterVisit({
      farewell: ["またね"],
      scripts: [
        [{ speaker: "guest", expression: "curious", text: "やあ" }],
        [{ speaker: "unknown", expression: "curious", text: "だれ？" }],
        [{ speaker: "host", expression: "not-a-expression", text: "誰？" }],
        [],
        "not-a-script",
        [{ speaker: "guest", text: "表情が無い" }],
      ],
    })

    expect(visit?.scripts).toEqual([[{ speaker: "guest", expression: "curious", text: "やあ" }]])
  })
})
