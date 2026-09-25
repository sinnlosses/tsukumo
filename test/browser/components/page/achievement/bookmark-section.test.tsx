import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, render, screen } from "@testing-library/react"

import { BookmarkSection } from "../../../../../src/browser/components/page/achievement/bookmark-section.tsx"
import { type DiaryBookmark } from "../../../../../src/shared/diary.ts"

afterEach(() => {
  cleanup()
})

const PLACED: DiaryBookmark = {
  kind: "placed",
  taskId: "T-99",
  summary: "架空の要約",
  reason: "架空の理由",
}

describe("BookmarkSection", () => {
  it("日記が無い日（undefined）は何も描かない", () => {
    const { container } = render(<BookmarkSection bookmark={undefined} writerName="架空の名前" />)
    expect(container.firstChild).toBeNull()
  })

  it("しおりの無い日記（none）は何も描かない", () => {
    const { container } = render(
      <BookmarkSection bookmark={{ kind: "none" }} writerName="架空の名前" />,
    )
    expect(container.firstChild).toBeNull()
  })

  it("しおりがあれば、名前・ID・要約・理由を出す", () => {
    render(<BookmarkSection bookmark={PLACED} writerName="架空の名前" />)

    expect(screen.getByText("架空の名前が選んだ この日のいちばん")).toBeDefined()
    expect(screen.getByText("T-99")).toBeDefined()
    expect(screen.getByText(/架空の要約/)).toBeDefined()
    expect(screen.getByText("「架空の理由」")).toBeDefined()
  })
})
