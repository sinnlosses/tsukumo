import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  BeforeAfterZoom,
  type BeforeAfterZoomImage,
} from "../../../../../../../../src/browser/components/page/conversation/components/markdown/renderer/before-after-zoom.tsx"

afterEach(() => {
  cleanup()
})

const BOTH = [
  { side: "before", src: "/架空/before.png", alt: "前の画面", region: undefined },
  { side: "after", src: "/架空/after.png", alt: "後の画面", region: undefined },
] as const satisfies readonly BeforeAfterZoomImage[]

const CAPTION = { number: "図 1", text: "架空の配置の前後" }

function renderZoom(
  overrides: {
    readonly images?: readonly BeforeAfterZoomImage[]
    readonly start?: "before" | "after"
    readonly caption?: { readonly number: string; readonly text: string }
    readonly onClose?: () => void
  } = {},
): void {
  render(
    <BeforeAfterZoom
      images={overrides.images ?? BOTH}
      start={overrides.start ?? "after"}
      caption={overrides.caption ?? CAPTION}
      onClose={overrides.onClose ?? (() => {})}
    />,
  )
}

function pressed(name: string): string | null {
  return screen.getByRole("button", { name }).getAttribute("aria-pressed")
}

function shownSrc(): string | null {
  return document.querySelector("dialog img")?.getAttribute("src") ?? null
}

describe("BeforeAfterZoom", () => {
  it("前／後の2つ組・案内・×・キャプションを出し、始めの側を選んでいる", () => {
    renderZoom()

    expect(screen.getByRole("group", { name: "前後" })).not.toBeNull()
    expect(pressed("前")).toBe("false")
    expect(pressed("後")).toBe("true")
    expect(screen.getByText("← → で前と後 · Esc で閉じる")).not.toBeNull()
    expect(screen.getByRole("button", { name: "閉じる" })).not.toBeNull()
    expect(screen.getByText("図 1")).not.toBeNull()
    expect(screen.getByText("架空の配置の前後")).not.toBeNull()
    expect(shownSrc()).toBe("/架空/after.png")
  })

  it("← → で前と後が入れかわり、2つ組のボタンを押しても同じに替わる", () => {
    renderZoom()
    const group = screen.getByRole("group", { name: "前後" })

    fireEvent.keyDown(group, { key: "ArrowLeft" })
    expect(pressed("前")).toBe("true")
    expect(pressed("後")).toBe("false")
    expect(shownSrc()).toBe("/架空/before.png")

    fireEvent.keyDown(group, { key: "ArrowRight" })
    expect(pressed("後")).toBe("true")
    expect(shownSrc()).toBe("/架空/after.png")

    fireEvent.click(screen.getByRole("button", { name: "前" }))
    expect(pressed("前")).toBe("true")
    expect(shownSrc()).toBe("/架空/before.png")
  })

  it("region のある側を出すと枠が出て、側を替えると枠が替わり、region の無い側には出ない", () => {
    const region = { left: 29.6, top: 44.6, width: 40.5, height: 10.6 }
    renderZoom({
      images: [BOTH[0], { ...BOTH[1], region }],
    })
    const frames = (): readonly HTMLElement[] => [
      ...document.querySelectorAll<HTMLElement>("dialog span.region-frame"),
    ]

    expect(frames()).toHaveLength(1)
    expect(frames()[0]?.dataset["side"]).toBe("after")
    expect(frames()[0]?.style.left).toBe("29.6%")
    expect(frames()[0]?.getAttribute("aria-hidden")).toBe("true")

    fireEvent.keyDown(screen.getByRole("group", { name: "前後" }), { key: "ArrowLeft" })
    expect(frames()).toHaveLength(0)

    fireEvent.keyDown(screen.getByRole("group", { name: "前後" }), { key: "ArrowRight" })
    expect(frames()).toHaveLength(1)
  })

  it("面は呼び出し側の入れ物（レポート本文の `.detail-block`）の外の body 直下に描かれ、本文の CSS を受けない", () => {
    const { container } = render(
      <div className="detail-block">
        <div className="report-captioned">
          <BeforeAfterZoom images={BOTH} start="after" caption={CAPTION} onClose={() => {}} />
        </div>
      </div>,
    )

    const dialog = document.querySelector("dialog")
    expect(dialog?.parentElement).toBe(document.body)
    expect(dialog?.closest(".detail-block")).toBeNull()
    expect(container.querySelector("dialog")).toBeNull()
  })

  it("×と、ダイアログの close（Esc）で onClose を呼ぶ", () => {
    const onClose = vi.fn<() => void>()
    renderZoom({ onClose })

    fireEvent.click(screen.getByRole("button", { name: "閉じる" }))
    expect(onClose).toHaveBeenCalledTimes(1)

    const dialog = document.querySelector("dialog")
    if (dialog === null) {
      throw new Error("<dialog> が無い")
    }
    fireEvent(dialog, new Event("close"))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it("題が空なら番号だけを出し、読めた側が1つなら2つ組はその側だけで矢印キーは動かない", () => {
    renderZoom({
      images: [BOTH[1]],
      caption: { number: "図 2", text: "" },
    })

    expect(screen.getByText("図 2")).not.toBeNull()
    expect(screen.queryByRole("button", { name: "前" })).toBeNull()
    expect(pressed("後")).toBe("true")

    fireEvent.keyDown(screen.getByRole("group", { name: "前後" }), { key: "ArrowLeft" })
    expect(shownSrc()).toBe("/架空/after.png")
  })
})
