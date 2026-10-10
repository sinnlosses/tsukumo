import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// 描画一式の読み込みを失敗させるか（チャンクを取れなかった場合の代役）。
const fetchFailure = vi.hoisted(() => ({ fail: false }))

vi.mock(
  "../../../../../../../src/browser/components/page/conversation/components/markdown/renderer/markdown-renderer.tsx",
  async (importOriginal) => {
    if (fetchFailure.fail) {
      throw new Error("チャンクを取れなかった")
    }
    return importOriginal()
  },
)

// 読み込みの状態はモジュールに1つなので、it ごとに読み直して初めから始める。
beforeEach(() => {
  vi.resetModules()
  fetchFailure.fail = false
})

afterEach(() => {
  cleanup()
})

describe("Markdown（描画一式を分けて読む口）", () => {
  it("読み終わるまでは空の器に aria-busy を出す", async () => {
    const { Markdown } = await freshDeferredMarkdown()
    const { container } = render(<Markdown text={"## 見出し"} />)

    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(container.textContent).toBe("")
  })

  it("読み込みに失敗したら、本文を字のまま出して aria-busy を残さない", async () => {
    fetchFailure.fail = true
    const { loadMarkdown, Markdown } = await freshDeferredMarkdown()
    const { container } = render(<Markdown text={"## 見出し"} />)

    await act(() => loadMarkdown())

    expect(container.querySelector('[aria-busy="true"]')).toBeNull()
    expect(container.textContent).toBe("## 見出し")
  })

  it("読み終わると本体に替わり、そのあとの最初の描画では器を挟まない", async () => {
    const { loadMarkdown, Markdown } = await freshDeferredMarkdown()
    const first = render(<Markdown text={"## 見出し"} />)

    await act(() => loadMarkdown())

    expect(first.container.querySelector('[aria-busy="true"]')).toBeNull()
    expect(screen.getByRole("heading", { name: "見出し" })).toBeDefined()

    const next = render(<Markdown text={"## 次の見出し"} />)
    expect(next.container.querySelector('[aria-busy="true"]')).toBeNull()
    expect(screen.getByRole("heading", { name: "次の見出し" })).toBeDefined()
  })
})

/** 読み込みの状態が初めの姿のモジュール（`beforeEach` で登録を捨ててから読む）。 */
function freshDeferredMarkdown() {
  return import("../../../../../../../src/browser/components/page/conversation/components/markdown/markdown.tsx")
}
