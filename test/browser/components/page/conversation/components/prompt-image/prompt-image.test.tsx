import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import {
  PromptImageChips,
  PromptImageThumbnails,
} from "../../../../../../../src/browser/components/page/conversation/components/prompt-image/prompt-image.tsx"
import {
  type PromptImage,
  promptImagePath,
  type RecordedPromptImage,
} from "../../../../../../../src/shared/prompt-image.ts"
import { setPageUrl } from "../../../../../../dom-environment.ts"

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

describe("PromptImageThumbnails", () => {
  // 記録に載っている控えと id の組（id は架空の UUID）。
  const RECORDED_A: RecordedPromptImage = {
    id: "0b6f7a52-3c1e-4d7a-9f2b-5e8c1d4a6b3f",
    thumbnail: "data:image/png;base64,thumbA",
  }
  const RECORDED_B: RecordedPromptImage = {
    id: "7d1c2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f",
    thumbnail: "data:image/png;base64,thumbB",
  }

  function zoomedImage(): HTMLImageElement | null {
    return zoomDialog()?.querySelector("img") ?? null
  }

  /** 拡大した絵が `<img>` の読み込みに失敗した（棚から消えていて 404 だった）ことにする。 */
  function failZoomedImage(): void {
    const image = zoomedImage()
    if (image === null) {
      throw new Error("拡大した絵が見つからない")
    }
    fireEvent(image, new Event("error"))
  }

  it("1枚も無ければ何も描かない", () => {
    render(<PromptImageThumbnails images={[]} />)

    expect(document.querySelector(".prompt-images")).toBeNull()
  })

  it("控えを押すと、棚の原寸を起動トークン付きの経路で拡大の面に開く", () => {
    setPageUrl("http://127.0.0.1:7517/?t=fictional-token")
    render(<PromptImageThumbnails images={[RECORDED_A, RECORDED_B]} />)

    expect(zoomDialog()).toBeNull()
    fireEvent.click(screen.getAllByRole("button", { name: "この画像を拡大" })[1] as Element)

    expect(zoomDialog()?.hasAttribute("open")).toBe(true)
    expect(zoomedImage()?.getAttribute("src")).toBe(
      `${promptImagePath(RECORDED_B.id)}?t=fictional-token`,
    )
  })

  it("原寸を読めなかった（棚から消えていた）ときは、控えを出して手放したことを1行添える", () => {
    render(<PromptImageThumbnails images={[RECORDED_A]} />)

    fireEvent.click(screen.getByRole("button", { name: "この画像を拡大" }))
    failZoomedImage()

    expect(zoomDialog()?.hasAttribute("open")).toBe(true)
    expect(zoomedImage()?.getAttribute("src")).toBe(RECORDED_A.thumbnail)
    expect(zoomDialog()?.textContent).toContain("原寸はもう手放した")
  })

  it("閉じてから開き直すと、また原寸を取りに行く", () => {
    render(<PromptImageThumbnails images={[RECORDED_A]} />)

    fireEvent.click(screen.getByRole("button", { name: "この画像を拡大" }))
    failZoomedImage()
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }))
    expect(zoomDialog()).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "この画像を拡大" }))

    expect(zoomedImage()?.getAttribute("src")).toStartWith(promptImagePath(RECORDED_A.id))
    expect(zoomDialog()?.textContent).not.toContain("原寸はもう手放した")
  })
})
