import { cleanup, fireEvent, screen } from "@testing-library/react"
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"

import {
  leafFrameClassNames,
  loadMarkdown,
} from "../../../../../src/browser/features/report/markdown.tsx"
import { useReplyNotes } from "../../../../../src/browser/stores/reply-note-list.ts"
import { newLeafHtml, renderDirectLeaf } from "../../../../fixture/direct-leaf-compare.tsx"
import { clickNthButton, renderNoteLeaf } from "../../../../fixture/reply-note-leaf.tsx"

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

describe("Options の「この案で進める」", () => {
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

  it("採らなかった案を含む全部の案に出る", () => {
    renderNoteLeaf(part, { port: true })
    expect(screen.getAllByRole("button", { name: "この案で進める" })).toHaveLength(ITEMS.length)
  })

  it("押すと定型の付箋が1件でき、その案のボタンだけ「付箋にした」に変わり、二度目は増えない", () => {
    const { ask } = renderNoteLeaf(part, { port: true })
    clickNthButton("この案で進める", 1)

    const notes = Object.values(useReplyNotes.getState().notesBySession).flat()
    expect(notes).toHaveLength(1)
    expect(notes[0]?.body).toBe("この案で進めて。")
    expect(notes[0]?.target.label.row).toBe("架空の案乙")
    expect(notes[0]?.target.key.rowIndex).toBe(1)
    expect(screen.getAllByRole("button", { name: "この案で進める" })).toHaveLength(3)
    fireEvent.click(screen.getByRole("button", { name: "付箋にした" }))
    expect(Object.values(useReplyNotes.getState().notesBySession).flat()).toHaveLength(1)
    expect(ask).not.toHaveBeenCalled()
  })

  it("付箋を外すとボタンが戻る", () => {
    renderNoteLeaf(part, { port: true })
    clickNthButton("この案で進める", 0)
    fireEvent.click(screen.getByRole("button", { name: "付箋を外す" }))
    expect(screen.getAllByRole("button", { name: "この案で進める" })).toHaveLength(ITEMS.length)
  })

  it("付箋は欄外注が無い部品でも欄外に札で出て、× で外すとボタンが戻る", () => {
    const { container } = renderNoteLeaf(part, { port: true })
    expect(container.querySelector(`.${leafFrameClassNames.gutter}`)).toBeNull()

    clickNthButton("この案で進める", 1)

    const gutter = container.querySelector(`.${leafFrameClassNames.gutter}`)
    expect(gutter).not.toBeNull()
    expect(gutter?.textContent).toContain("頼 1")
    expect(gutter?.textContent).toContain("架空の案乙")
    expect(gutter?.textContent).toContain("この案で進めて。")
    expect(gutter?.textContent).toContain("まだ送っていない")
    expect(gutter?.contains(screen.getByRole("button", { name: "付箋を外す" }))).toBe(true)

    fireEvent.click(screen.getByRole("button", { name: "付箋を外す" }))

    expect(container.querySelector(`.${leafFrameClassNames.gutter}`)).toBeNull()
    expect(screen.getAllByRole("button", { name: "この案で進める" })).toHaveLength(ITEMS.length)
  })

  it("口が無い描画には出ない", () => {
    renderNoteLeaf(part, { port: false })
    expect(screen.queryAllByRole("button")).toHaveLength(0)
  })
})
