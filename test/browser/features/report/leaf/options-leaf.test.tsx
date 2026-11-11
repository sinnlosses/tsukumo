import { act, cleanup, fireEvent, screen } from "@testing-library/react"
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"

import {
  leafFrameClassNames,
  loadMarkdown,
} from "../../../../../src/browser/features/report/markdown.tsx"
import { useReplyNotes } from "../../../../../src/browser/stores/reply-note-list.ts"
import { newLeafHtml, renderDirectLeaf } from "../../../../fixture/direct-leaf-compare.tsx"
import { openRequestAt, renderNoteLeaf } from "../../../../fixture/reply-note-leaf.tsx"

beforeAll(async () => {
  await loadMarkdown()
})

afterEach(() => {
  cleanup()
})

type Verdict = "adopt" | "consider" | "reject"

function freshHtml(title: string, items: { name: string; verdict: Verdict; reason: string }[]) {
  const block = { kind: "options", title, items, fold: "", aside: "" } as const
  const part = { id: "o1", component: "Options", title, items, fold: "", aside: "" } as const
  return newLeafHtml(block, part)
}

const ITEMS: { name: string; verdict: Verdict; reason: string }[] = [
  { name: "架空の案甲 `a.ts`", verdict: "adopt", reason: "架空の理由 `#ff8800`" },
  { name: "架空の案乙", verdict: "consider", reason: "" },
  { name: "架空の案丙", verdict: "reject", reason: "架空の理由 {{1 → 2}}" },
  { name: "架空の案丁", verdict: "adopt", reason: "二つ目の採る" },
]

describe("Options の部品", () => {
  it("題があれば題の段落を描き、題が空なら描かない", () => {
    const options = (title: string) =>
      renderDirectLeaf({ id: "o1", component: "Options", title, items: ITEMS, fold: "", aside: "" })

    expect(options("架空の題").container.querySelector("strong")?.textContent).toBe("架空の題")
    cleanup()
    const { container } = options("")
    expect(container.querySelector("strong")).toBeNull()
    expect(container.textContent).toContain("架空の案")
  })

  it("番号は出さず、判定を記号つきの札で出す", () => {
    const fresh = freshHtml("架空の題", ITEMS)

    expect(fresh).not.toContain(">1</span>")
    expect(fresh).toContain('<span aria-hidden="true">✓</span>採る</span>')
    expect(fresh).toContain('<span aria-hidden="true">〜</span>検討</span>')
    expect(fresh).toContain('<span aria-hidden="true">–</span>採らない</span>')
  })
})

describe("Options の案を指して頼む", () => {
  const part = {
    id: "o1",
    component: "Options",
    title: "架空の題",
    items: ITEMS,
    fold: "",
    aside: "",
  } as const

  beforeEach(() => {
    useReplyNotes.setState(useReplyNotes.getInitialState(), true)
  })

  /** 案乙を指して頼むの欄を開き、書き始めの字のまま付箋にする。 */
  function noteSecondOption(): void {
    const field = openRequestAt("架空の案乙")
    fireEvent.keyDown(field, { key: "Enter", metaKey: true })
  }

  it("何も押していないときはボタンが無く、採らなかった案も押すと「聞く・頼む」が1つ出る", () => {
    renderNoteLeaf(part, { port: true })
    expect(screen.queryAllByRole("button")).toHaveLength(0)

    fireEvent.click(screen.getByText("架空の案丙"))

    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "聞く・頼む",
    ])
  })

  it("頼むに切り替えると欄の書き始めが「この案で進めて。」になり、送ると案を指した付箋が1件でき ask は呼ばれない", () => {
    const { ask } = renderNoteLeaf(part, { port: true })

    expect(openRequestAt("架空の案乙")).toHaveProperty("value", "この案で進めて。")
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter", metaKey: true })

    const notes = Object.values(useReplyNotes.getState().notesBySession).flat()
    expect(notes).toHaveLength(1)
    expect(notes[0]?.body).toBe("この案で進めて。")
    expect(notes[0]?.target.label).toEqual({
      section: "架空の節",
      component: "架空の題",
      row: "架空の案乙",
    })
    expect(notes[0]?.target.key.rowIndex).toBe(1)
    expect(ask).not.toHaveBeenCalled()
  })

  it("聞くに戻すと書き始めの字を外す", () => {
    renderNoteLeaf(part, { port: true })
    openRequestAt("架空の案乙")

    fireEvent.click(screen.getByRole("radio", { name: "聞く" }))

    expect(screen.getByRole("textbox")).toHaveProperty("value", "")
  })

  it("付箋は欄外注が無い部品でも欄外に札で出て、× で外せる", () => {
    const { container } = renderNoteLeaf(part, { port: true })
    expect(container.querySelector(`.${leafFrameClassNames.gutter}`)).toBeNull()

    noteSecondOption()

    const gutter = container.querySelector(`.${leafFrameClassNames.gutter}`)
    expect(gutter).not.toBeNull()
    expect(gutter?.textContent).toContain("頼 1")
    expect(gutter?.textContent).toContain("架空の案乙")
    expect(gutter?.textContent).toContain("この案で進めて。")
    expect(gutter?.textContent).toContain("まだ送っていない")
    expect(gutter?.contains(screen.getByRole("button", { name: "付箋を外す" }))).toBe(true)

    fireEvent.click(screen.getByRole("button", { name: "付箋を外す" }))

    expect(container.querySelector(`.${leafFrameClassNames.gutter}`)).toBeNull()
  })

  it("送った付箋は欄外に「送った → やり取り n で作業中」と残り、外すボタンは出ない", () => {
    const { container } = renderNoteLeaf(part, { port: true })
    noteSecondOption()
    const [note] = Object.entries(useReplyNotes.getState().notesBySession).flatMap(
      ([sessionKey, notes]) => notes.map((candidate) => ({ sessionKey, id: candidate.id })),
    )
    if (note === undefined) throw new Error("付箋が無い")

    act(() => {
      useReplyNotes.getState().markSent(note.sessionKey, [note.id], 3)
    })

    const card = container.querySelector(`.${leafFrameClassNames.gutterNote}`)
    expect(card?.textContent).toContain("送った → やり取り 3 で作業中")
    expect(screen.queryByRole("button", { name: "付箋を外す" })).toBeNull()
  })

  it("口が無い描画では押してもボタンが出ない", () => {
    renderNoteLeaf(part, { port: false })
    fireEvent.click(screen.getByText("架空の案乙"))
    expect(screen.queryAllByRole("button")).toHaveLength(0)
  })
})
