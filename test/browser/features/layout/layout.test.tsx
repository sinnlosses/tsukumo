import { afterEach, beforeEach, describe, expect, it } from "bun:test"

import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { Layout } from "../../../../src/browser/features/layout/layout.tsx"
import {
  DEFAULT_SPLIT,
  loadSplit,
  saveSplit,
} from "../../../../src/browser/features/layout/split.ts"

/**
 * 4領域は中身の判別さえできればよいので、部品名の文字列だけ渡す
 * （`<Layout>` は他の `features/` を import しない。test/architecture.test.ts）。
 */
function renderLayout(collapseCharacter = false): void {
  render(
    <Layout
      main="main"
      sidebar="sidebar"
      character="character"
      dispatch="dispatch"
      collapseCharacter={collapseCharacter}
    />,
  )
}

/** 仕切りの位置（%）は container の矩形から出るので、happy-dom の 0 のままでは測れない。 */
function stubBoundingRect(element: HTMLElement, width: number, height: number): void {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ top: 0, left: 0, width, height, right: width, bottom: height, x: 0, y: 0 }),
  })
}

/** 仕切りが動かす対象（上段の行・grid 全体）は、領域の `<section>` の親をたどって取る。 */
function requireElement(element: HTMLElement | null | undefined, what: string): HTMLElement {
  if (element === null || element === undefined) {
    throw new Error(`${what} が見つからない`)
  }
  return element
}

function rowTopElement(): HTMLElement {
  return requireElement(
    document.querySelector<HTMLElement>('[data-region="main"]')?.parentElement,
    "上段の行",
  )
}

beforeEach(() => {
  saveSplit(DEFAULT_SPLIT)
})

afterEach(() => {
  cleanup()
  saveSplit(DEFAULT_SPLIT)
})

describe("Layout", () => {
  it("比率を戻すボタンは常設で出る", () => {
    renderLayout()

    expect(screen.getByRole("button", { name: "領域の比率を既定に戻す" })).toBeDefined()
  })

  it("比率を戻すボタンを押すと、保存済みの比率が DEFAULT_SPLIT に戻る", () => {
    saveSplit({ rowTop: 20, topLeft: 30, bottomLeft: 40 })
    renderLayout()

    fireEvent.click(screen.getByRole("button", { name: "領域の比率を既定に戻す" }))

    expect(loadSplit()).toEqual(DEFAULT_SPLIT)
  })

  it("ドラッグ中は CSS カスタムプロパティだけが追随し、離したときに保存される", () => {
    renderLayout()
    const rowTop = rowTopElement()
    stubBoundingRect(rowTop, 1000, 400)
    const resizer = screen.getByRole("separator", { name: "メインビューとサイドバーの境界" })

    fireEvent.pointerDown(resizer, { pointerId: 1, clientX: 750, clientY: 0 })
    fireEvent.pointerMove(resizer, { clientX: 400, clientY: 0 })

    expect(rowTop.style.getPropertyValue("--layout-top-left")).toBe("40fr")
    expect(rowTop.style.getPropertyValue("--layout-top-right")).toBe("60fr")
    // 動かしている間は保存しない（効くのは CSS カスタムプロパティだけ）。
    expect(loadSplit()).toEqual(DEFAULT_SPLIT)

    fireEvent.pointerUp(resizer, { clientX: 400, clientY: 0 })

    expect(loadSplit()).toEqual({ ...DEFAULT_SPLIT, topLeft: 40 })
    // 離したあとのレンダーでも動かした位置のまま（state と DOM が食い違わない）。
    expect(rowTop.style.getPropertyValue("--layout-top-left")).toBe("40fr")
  })

  it("上下の仕切りは行の比率だけを動かし、他の2本の位置を巻き込まない", () => {
    saveSplit({ rowTop: 60, topLeft: 30, bottomLeft: 40 })
    renderLayout()
    const grid = requireElement(rowTopElement().parentElement, "grid")
    stubBoundingRect(grid, 1000, 500)
    const resizer = screen.getByRole("separator", { name: "上段と下段の境界" })

    fireEvent.pointerDown(resizer, { pointerId: 1, clientX: 0, clientY: 300 })
    fireEvent.pointerMove(resizer, { clientX: 0, clientY: 100 })
    fireEvent.pointerUp(resizer, { clientX: 0, clientY: 100 })

    expect(grid.style.getPropertyValue("--layout-row-top")).toBe("20fr")
    expect(loadSplit()).toEqual({ rowTop: 20, topLeft: 30, bottomLeft: 40 })
  })

  // 狭い画面でどちらの領域を出すかは CSS（@media）が data-narrow-pane を見て決めるので、
  // 部品の側で確かめられるのは「タブを押すと印が入れ替わる」ところまで。
  it("上段のタブを押すと、出す領域の印が入れ替わる", () => {
    renderLayout()
    const sidebarTab = screen.getByRole("tab", { name: "サイドバー" })

    expect(rowTopElement().dataset["narrowPane"]).toBe("main")

    fireEvent.click(sidebarTab)

    expect(rowTopElement().dataset["narrowPane"]).toBe("sidebar")
    expect(sidebarTab.getAttribute("aria-selected")).toBe("true")
    // 領域そのものは4つとも残る（タブは見せる側を選ぶだけ。docs/requirements.md 4.7）。
    expect(document.querySelector('[data-region="main"]')).not.toBeNull()
  })

  it("キャラビューを畳むと、その領域と2本の仕切りが消える（雑談モード）", () => {
    renderLayout(true)

    expect(screen.queryByText("character")).toBe(null)
    expect(screen.queryByLabelText("キャラビューと入力欄の境界")).toBe(null)
    // 上段の高さが固定されるので、掴めるのに効かない仕切りを残さない。
    expect(screen.queryByLabelText("上段と下段の境界")).toBe(null)
    // 入力欄は残る（下段が入力欄だけになる）。
    expect(screen.getByText("dispatch")).toBeTruthy()
  })

  it("畳んでいる間も、使う人が決めた比率は保存したまま", () => {
    // 描くときだけ固定の高さを当てる（state は触らない）。仕事へ戻すとそのまま効く。
    saveSplit({ rowTop: 60, topLeft: 30, bottomLeft: 40 })
    renderLayout(true)

    expect(loadSplit()).toEqual({ rowTop: 60, topLeft: 30, bottomLeft: 40 })
  })

  it("畳むのをやめると、キャラビューと仕切りが戻る", () => {
    renderLayout(false)

    expect(screen.getByText("character")).toBeTruthy()
    expect(screen.getByLabelText("キャラビューと入力欄の境界")).toBeTruthy()
    expect(screen.getByLabelText("上段と下段の境界")).toBeTruthy()
  })

  it("一度も動かさずに離したときは保存しない", () => {
    saveSplit({ rowTop: 60, topLeft: 30, bottomLeft: 40 })
    renderLayout()
    stubBoundingRect(rowTopElement(), 1000, 400)
    const resizer = screen.getByRole("separator", { name: "メインビューとサイドバーの境界" })

    // 掴んだ位置（75%）は保存済みの比率（30%）と違うので、掴んだだけで保存されれば落ちる。
    fireEvent.pointerDown(resizer, { pointerId: 1, clientX: 750, clientY: 0 })
    fireEvent.pointerUp(resizer, { clientX: 750, clientY: 0 })

    expect(loadSplit()).toEqual({ rowTop: 60, topLeft: 30, bottomLeft: 40 })
  })
})
