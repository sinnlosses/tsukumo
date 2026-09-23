import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { PromptImageChips } from "../../../src/browser/components/prompt-image.tsx"
import { type PromptImage } from "../../../src/shared/prompt-image.ts"

// フィクスチャはすべて手で書いた架空の data URL（実物の画像は使わない。
// docs/coding-standards.md「会話内容の扱い」）。

const IMAGE_A: PromptImage = {
  full: "data:image/png;base64,fullA",
  thumbnail: "data:image/png;base64,thumbA",
}
const IMAGE_B: PromptImage = {
  full: "data:image/png;base64,fullB",
  thumbnail: "data:image/png;base64,thumbB",
}

afterEach(() => {
  cleanup()
})

function renderChips(
  images: readonly PromptImage[],
  onRemove: (index: number) => void = () => {},
): void {
  render(<PromptImageChips images={images} onRemove={onRemove} />)
}

/** 拡大の面（開いているときだけ木に居る）。 */
function zoomDialog(): Element | null {
  return document.querySelector("dialog.image-zoom")
}

describe("PromptImageChips", () => {
  it("1枚も無ければ何も描かない", () => {
    renderChips([])

    expect(document.querySelector(".prompt-images")).toBeNull()
  })

  it("押すまで拡大の面は組み立てない", () => {
    renderChips([IMAGE_A])

    expect(zoomDialog()).toBeNull()
  })

  it("絵を押すと、その原寸で拡大の面が開く", () => {
    renderChips([IMAGE_A, IMAGE_B])

    fireEvent.click(screen.getAllByRole("button", { name: "この画像を拡大" })[1] as Element)

    const dialog = zoomDialog()
    expect(dialog?.hasAttribute("open")).toBe(true)
    expect(dialog?.querySelector("img")?.getAttribute("src")).toBe(IMAGE_B.full)
  })

  it("`×` を押しても拡大の面は開かず、外す通知だけが飛ぶ", () => {
    const removed: number[] = []
    renderChips([IMAGE_A], (index) => removed.push(index))

    fireEvent.click(screen.getByRole("button", { name: "この画像を外す" }))

    expect(removed).toEqual([0])
    expect(zoomDialog()).toBeNull()
  })

  it("閉じるボタンで拡大の面が閉じる", () => {
    renderChips([IMAGE_A])

    fireEvent.click(screen.getByRole("button", { name: "この画像を拡大" }))
    expect(zoomDialog()).not.toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "閉じる" }))
    expect(zoomDialog()).toBeNull()
  })

  // Esc は `<dialog>` を閉じて `close` イベントを出す（ブラウザの既定の振る舞い）。
  // 受けるのは `<dialog onClose={...}>` なので、ここはそのイベントだけを起こす
  // （`test/browser/features/task-board/task-run.test.tsx` と同じ形）。
  it("Esc で閉じたときも拡大の面が外れる", () => {
    renderChips([IMAGE_A])

    fireEvent.click(screen.getByRole("button", { name: "この画像を拡大" }))
    const dialog = zoomDialog()
    if (dialog === null) {
      throw new Error("拡大の面が開いていない")
    }
    fireEvent(dialog, new Event("close"))

    expect(zoomDialog()).toBeNull()
  })

  it("背景を押すと拡大の面が閉じる（中身を押しても閉じない）", () => {
    renderChips([IMAGE_A])

    fireEvent.click(screen.getByRole("button", { name: "この画像を拡大" }))
    const dialog = zoomDialog()
    if (dialog === null) {
      throw new Error("拡大の面が開いていない")
    }

    // 中身（img）を押しても target は img のままで dialog 自身ではないので閉じない。
    const image = dialog.querySelector("img")
    if (image === null) {
      throw new Error("拡大した絵が見つからない")
    }
    fireEvent.click(image)
    expect(zoomDialog()).not.toBeNull()

    // target が dialog 自身になるのは backdrop を押したときだけ。
    fireEvent.click(dialog)
    expect(zoomDialog()).toBeNull()
  })
})
