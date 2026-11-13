import { describe, expect, it } from "vitest"

import {
  drawnGuideNotes,
  type GuideNoteTargets,
} from "../../../../../src/browser/features/report/domain/guide-note-target.ts"

const targets: GuideNoteTargets = {
  componentIds: new Set(["s1", "s2", "s3", "s4"]),
  fields: new Set(["head", "ledger"]),
}

describe("drawnGuideNotes", () => {
  it("部品の ID と紙の欄を、置き場に解く", () => {
    expect(
      drawnGuideNotes(
        [
          { target: "s1", text: "架空の一言" },
          { target: "checks", text: "もう一言" },
        ],
        targets,
      ),
    ).toEqual([
      { text: "架空の一言", place: { kind: "component", id: "s1" } },
      { text: "もう一言", place: { kind: "field", field: "ledger" } },
    ])
  })

  it("4つ以上渡されても先頭3つだけ返す", () => {
    const notes = ["s1", "s2", "s3", "s4"].map((target) => ({ target, text: target }))
    expect(drawnGuideNotes(notes, targets).map((note) => note.text)).toEqual(["s1", "s2", "s3"])
  })

  it("置き場が紙に無い target は、捨てて別の場所へ落とさない", () => {
    expect(
      drawnGuideNotes(
        [
          { target: "hidden", text: "隠れた部品" },
          { target: "keyFigures", text: "描いていない欄" },
          { target: "task", text: "指し先にならない欄" },
        ],
        targets,
      ),
    ).toEqual([])
  })

  it("同じ target に2枚あれば、どちらも返す", () => {
    expect(
      drawnGuideNotes(
        [
          { target: "s1", text: "一枚目" },
          { target: "s1", text: "二枚目" },
        ],
        targets,
      ),
    ).toHaveLength(2)
  })

  it("空の列は空を返す", () => {
    expect(drawnGuideNotes([], targets)).toEqual([])
  })
})
