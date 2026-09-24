import { describe, expect, it } from "bun:test"

import { chooseVisit, visitGuests } from "../../../src/server/core/visit-guest.ts"
import { type CharacterVisit, type VisitScript } from "../../../src/shared/character-visit.ts"

// 台本と帰りの一言は手で書いた架空のもの（docs/coding-standards.md「会話内容の扱い」）。
const FIRST_SCRIPT: VisitScript = [
  { speaker: "guest", expression: "curious", text: "架空の台本1の一言目" },
]
const SECOND_SCRIPT: VisitScript = [
  { speaker: "guest", expression: "bored", text: "架空の台本2の一言目" },
]

const VISIT: CharacterVisit = {
  peek: undefined,
  farewell: ["架空のさようなら1", "架空のさようなら2"],
  scripts: [FIRST_SCRIPT, SECOND_SCRIPT],
}

describe("visitGuests", () => {
  it("visit を持つパックだけが客になれる（台本が無くても、作れたときのために候補に入る）", () => {
    const guests = visitGuests([
      { name: "with-visit", definition: { visit: VISIT } },
      { name: "no-visit", definition: { visit: undefined } },
      { name: "no-script", definition: { visit: { ...VISIT, scripts: [] } } },
      { name: "no-definition", definition: undefined },
    ])

    expect(guests).toEqual([
      { pack: "with-visit", visit: VISIT },
      { pack: "no-script", visit: { ...VISIT, scripts: [] } },
    ])
  })
})

describe("chooseVisit", () => {
  const guests = [
    { pack: "guest-a", visit: VISIT },
    { pack: "guest-b", visit: VISIT },
  ]

  it("あるじ自身は来ない", () => {
    expect(chooseVisit(guests, "guest-a", () => 0)).toEqual({
      kind: "chosen",
      guest: "guest-b",
      fallback: { kind: "script", script: FIRST_SCRIPT },
      farewell: "架空のさようなら1",
    })
  })

  it("候補が複数なら乱数で1人・1本・1言を選ぶ", () => {
    expect(chooseVisit(guests, "host", () => 0.99)).toEqual({
      kind: "chosen",
      guest: "guest-b",
      fallback: { kind: "script", script: SECOND_SCRIPT },
      farewell: "架空のさようなら2",
    })
    expect(chooseVisit(guests, "host", () => 0)).toEqual({
      kind: "chosen",
      guest: "guest-a",
      fallback: { kind: "script", script: FIRST_SCRIPT },
      farewell: "架空のさようなら1",
    })
  })

  it("客のパックに台本が無ければ、落とし先は none", () => {
    expect(
      chooseVisit([{ pack: "guest", visit: { ...VISIT, scripts: [] } }], "host", () => 0),
    ).toEqual({
      kind: "chosen",
      guest: "guest",
      fallback: { kind: "none" },
      farewell: "架空のさようなら1",
    })
  })

  it("あるじのほかに候補が居なければ来ない", () => {
    expect(chooseVisit([{ pack: "host", visit: VISIT }], "host", () => 0)).toEqual({
      kind: "none",
    })
    expect(chooseVisit([], "host", () => 0)).toEqual({ kind: "none" })
  })
})
