import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { type ReactElement, useState } from "react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import type { PairView } from "../../../../../src/browser/features/report/domain/pair-view.ts"
import {
  DirectLeaf,
  directLeafViewOf,
} from "../../../../../src/browser/features/report/leaf/direct-leaf-view.tsx"
import { PairViewContext } from "../../../../../src/browser/features/report/leaf/pair-view-context.ts"
import { loadMarkdown } from "../../../../../src/browser/features/report/markdown.tsx"
import type { A2uiReportComponent } from "../../../../../src/shared/report/a2ui-report-catalog.ts"
import type { ReportImageSource } from "../../../../../src/shared/report/report-image-markdown.ts"
import type { LeafValue } from "../../../../../src/shared/report/report-leaf-value.ts"

beforeAll(async () => {
  await loadMarkdown()
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

type ComparePart = Extract<A2uiReportComponent, { readonly component: "Compare" }>

const VALUE: LeafValue = {
  captionNumber: { kind: "figure", ordinal: 1 },
  tagTones: {},
  gutterNotes: [],
  mergedIntoPrevious: false,
}

const SHELVED: ReportImageSource = {
  kind: "shelved",
  toolUseId: "架空の呼び出し",
  sizes: [],
  unshelved: [],
}

const IMAGE_PAIR: ComparePart = {
  id: "c1",
  component: "Compare",
  title: "",
  relation: "before-after",
  sides: [
    { kind: "image", heading: "今", path: "架空前.png" },
    { kind: "image", heading: "採ったあと", path: "架空後.png" },
  ],
  fold: "",
  aside: "",
}

function Harness(props: { readonly ownerId?: string }): ReactElement {
  const [view, setView] = useState<PairView>("side")
  const leaf = directLeafViewOf(IMAGE_PAIR)
  if (leaf === undefined) {
    throw new Error("Compare の部品が一覧に無い")
  }
  return (
    <PairViewContext
      value={{
        view,
        setView,
        ...(props.ownerId === undefined ? {} : { ownerId: props.ownerId }),
        labels: { after: "後だけ", before: "前だけ" },
      }}
    >
      <div data-report-region="section">
        <DirectLeaf part={IMAGE_PAIR} value={VALUE} imageSource={SHELVED} view={leaf} />
      </div>
      <button type="button" onClick={() => setView("after")}>
        外から後だけ
      </button>
      <button type="button" onClick={() => setView("side")}>
        外から並べる
      </button>
    </PairViewContext>
  )
}

function imageViewGroup(): HTMLElement | undefined {
  return screen
    .queryAllByRole("group", { name: "見せ方" })
    .find((group) => !group.className.includes("report-pair-switch"))
}

function viewNames(): string[] {
  // Button は見える字と読み上げ用の字の2つを持つので、textContent は同じ語が2回続く
  return Array.from(imageViewGroup()?.querySelectorAll("button") ?? [], (button) => {
    const text = button.textContent
    return text.slice(0, text.length / 2)
  })
}

describe("紙の切り替えが付いた紙の画像の対", () => {
  it("見せ方の群に「並べる」が無く「切り替え」が並ぶ", () => {
    render(<Harness ownerId="c1" />)
    const names = viewNames()
    expect(names).not.toContain("並べる")
    expect(names).toContain("切り替え")
  })

  it("紙の切り替えが無い紙の外では「並べる」を含む今のままの群が出る", () => {
    render(<Harness />)
    expect(viewNames().slice(0, 2)).toEqual(["並べる", "切り替え"])
  })

  it("紙が「後だけ」の間は群が消え、「並べる」に戻すと再び出る", () => {
    render(<Harness ownerId="c1" />)
    fireEvent.click(screen.getByRole("button", { name: "外から後だけ" }))
    expect(imageViewGroup()).toBeUndefined()
    fireEvent.click(screen.getByRole("button", { name: "外から並べる" }))
    expect(imageViewGroup()).toBeDefined()
  })

  it("群の「切り替え」を押すと選ばれ、もう一度押すと並べる（どれも押されていない）に戻る", () => {
    render(<Harness ownerId="c1" />)
    const pressedOf = (): string[] =>
      Array.from(
        imageViewGroup()?.querySelectorAll("button[aria-pressed='true']") ?? [],
        (button) => button.textContent.slice(0, button.textContent.length / 2),
      )
    fireEvent.click(screen.getByRole("button", { name: "切り替え" }))
    expect(pressedOf()).toEqual(["切り替え"])
    fireEvent.click(screen.getByRole("button", { name: "切り替え" }))
    expect(pressedOf()).toEqual([])
  })
})
