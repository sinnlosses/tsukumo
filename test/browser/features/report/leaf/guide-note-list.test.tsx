import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import type { GuideNoteField } from "../../../../../src/browser/features/report/domain/guide-note-target.ts"
import {
  GuideNoteFrame,
  GuideNoteScope,
} from "../../../../../src/browser/features/report/leaf/guide-note-list.tsx"

afterEach(() => {
  cleanup()
})

const FACE = { url: "/character/架空/face.png", alt: "架空の名前" }

function drawFields(notes: readonly { target: string; text: string }[]) {
  const fields = new Set<GuideNoteField>(["head", "ledger", "figures"])
  render(
    <GuideNoteScope
      notes={notes}
      targets={{ componentIds: new Set(["leaf-1"]), fields }}
      leafIdsOf={(id) => [id]}
      face={FACE}
    >
      <GuideNoteFrame field="head">
        <p>頭の本文</p>
      </GuideNoteFrame>
      <GuideNoteFrame field="ledger">
        <p>確かさの本文</p>
      </GuideNoteFrame>
    </GuideNoteScope>,
  )
}

describe("GuideNoteFrame", () => {
  it("指された欄の横に、一言と顔を描く", () => {
    drawFields([{ target: "checks", text: "ここだけ、まだ見ていないの" }])

    expect(screen.getByText("ここだけ、まだ見ていないの")).toBeTruthy()
    expect(screen.getByRole("img", { name: "架空の名前" }).getAttribute("src")).toBe(FACE.url)
    expect(document.querySelector('[data-guide-frame="ledger"]')).not.toBeNull()
    expect(document.querySelector('[data-guide-frame="head"]')).toBeNull()
  })

  it("付箋が無い欄は、包まず本文だけを描く", () => {
    drawFields([])

    expect(screen.getByText("頭の本文")).toBeTruthy()
    expect(document.querySelector("[data-guide-frame]")).toBeNull()
    expect(document.querySelector("[data-margin-card]")).toBeNull()
  })

  it("4つ以上渡されても描くのは3つまで", () => {
    drawFields(
      ["一", "二", "三", "四"].map((text) => ({ target: "conclusion", text: `付箋${text}` })),
    )

    expect(screen.queryByText("付箋三")).toBeTruthy()
    expect(screen.queryByText("付箋四")).toBeNull()
  })

  it("置き場が無い target の付箋は描かない", () => {
    drawFields([{ target: "unknown-part", text: "どこにも無い所" }])

    expect(screen.queryByText("どこにも無い所")).toBeNull()
  })
})
