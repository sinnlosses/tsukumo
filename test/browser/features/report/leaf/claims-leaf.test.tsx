import { cleanup, fireEvent, screen } from "@testing-library/react"
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { loadMarkdown } from "../../../../../src/browser/features/report/markdown.tsx"
import { useReplyNotes } from "../../../../../src/browser/stores/reply-note-list.ts"
import { renderDirectLeaf } from "../../../../fixture/direct-leaf-compare.tsx"
import { openRequestAt, renderNoteLeaf } from "../../../../fixture/reply-note-leaf.tsx"

beforeAll(async () => {
  await loadMarkdown()
})

afterEach(() => {
  cleanup()
})

const ITEMS: {
  claim: string
  certainty: "confirmed" | "inferred" | "unverified"
  basis: string
  howToVerify: string
}[] = [
  { claim: "架空の確かな主張", certainty: "confirmed", basis: "架空の根拠", howToVerify: "" },
  { claim: "架空の推測の主張", certainty: "inferred", basis: "", howToVerify: "架空の手順" },
  {
    claim: "架空の未確認の主張",
    certainty: "unverified",
    basis: "架空の別の根拠",
    howToVerify: "架空の別の手順",
  },
]

function rowTextOf(claim: string): string {
  return screen.getByText(claim).parentElement?.textContent ?? ""
}

describe("Claims の部品", () => {
  it("確度ごとに、確定・推測・未確認の語を主張の行に添える", () => {
    renderDirectLeaf({ id: "c1", component: "Claims", items: ITEMS, fold: "", aside: "" })

    expect(rowTextOf("架空の確かな主張")).toContain("確定")
    expect(rowTextOf("架空の推測の主張")).toContain("推測")
    expect(rowTextOf("架空の未確認の主張")).toContain("未確認")
  })

  it("根拠と確かめ方は、字のある欄だけを見出しつきで描く", () => {
    renderDirectLeaf({ id: "c1", component: "Claims", items: ITEMS, fold: "", aside: "" })

    const confirmed = rowTextOf("架空の確かな主張")
    expect(confirmed).toContain("根拠架空の根拠")
    expect(confirmed).not.toContain("確かめ方")
    const inferred = rowTextOf("架空の推測の主張")
    expect(inferred).not.toContain("根拠")
    expect(inferred).toContain("確かめ方架空の手順")
    const unverified = rowTextOf("架空の未確認の主張")
    expect(unverified).toContain("根拠架空の別の根拠")
    expect(unverified).toContain("確かめ方架空の別の手順")
  })
})

describe("Claims の主張を指して頼む", () => {
  const part = { id: "c1", component: "Claims", items: ITEMS, fold: "", aside: "" } as const

  beforeEach(() => {
    useReplyNotes.setState(useReplyNotes.getInitialState(), true)
  })

  it("何も押していないときはボタンが無く、確定の主張も押すと「聞く・頼む」が1つ出る", () => {
    renderNoteLeaf(part, { port: true })
    expect(screen.queryAllByRole("button")).toHaveLength(0)

    fireEvent.click(screen.getByText("架空の確かな主張"))

    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "聞く・頼む",
    ])
  })

  it("頼むに切り替えると欄の書き始めが確かめ方つきの字になり、送ると主張を指した付箋が1件でき ask は呼ばれない", () => {
    const { ask } = renderNoteLeaf(part, { port: true })

    const field = openRequestAt("架空の推測の主張")
    expect(field).toHaveProperty("value", "確かめて。確かめ方: 架空の手順")
    fireEvent.keyDown(field, { key: "Enter", metaKey: true })

    const notes = Object.values(useReplyNotes.getState().notesBySession).flat()
    expect(notes).toHaveLength(1)
    expect(notes[0]?.body).toBe("確かめて。確かめ方: 架空の手順")
    expect(notes[0]?.target.key).toEqual({
      reportToolUseId: "toolu_1",
      componentId: "c1",
      rowIndex: 1,
    })
    expect(ask).not.toHaveBeenCalled()
  })

  it("確かめ方の無い主張の書き始めは「確かめて。」", () => {
    renderNoteLeaf(part, { port: true })

    expect(openRequestAt("架空の確かな主張")).toHaveProperty("value", "確かめて。")
  })

  it("口が無い描画では押してもボタンが出ない", () => {
    renderNoteLeaf(part, { port: false })
    fireEvent.click(screen.getByText("架空の推測の主張"))
    expect(screen.queryAllByRole("button")).toHaveLength(0)
  })
})
