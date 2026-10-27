// 口の出し分けと、押したときの下書き・フォーカスの合図。位置と見た目は目視と E2E で確かめる。

import { act, cleanup, createEvent, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { SelectionAsk } from "../../../../../../../src/browser/components/page/conversation/components/main-view/selection-ask.tsx"
import { useComposerDraft } from "../../../../../../../src/browser/components/page/conversation/stores/composer-draft.ts"
import { useComposerFocus } from "../../../../../../../src/browser/stores/composer-focus.ts"

const RECT = { left: 40, bottom: 100 }

beforeEach(() => {
  // happy-dom は描画しないので、範囲の矩形は空になる。位置を決める矩形だけ差し替える。
  Reflect.set(Object.getPrototypeOf(document.createRange()), "getClientRects", () => [RECT])
})

afterEach(() => {
  cleanup()
  document.getSelection()?.removeAllRanges()
  useComposerDraft.setState(useComposerDraft.getInitialState(), true)
  useComposerFocus.setState(useComposerFocus.getInitialState(), true)
})

function renderPage(): { inside: Node; outside: Node } {
  const { container } = render(
    <>
      <div data-report-body="">
        <p>架空のレポートの本文</p>
      </div>
      <p>レポートの外の字</p>
      <SelectionAsk />
    </>,
  )
  const inside = container.querySelector("[data-report-body] p")?.firstChild
  const outside = container.querySelector(":scope > p")?.firstChild
  if (inside === undefined || inside === null || outside === undefined || outside === null) {
    throw new Error("フィクスチャの本文が描かれていない")
  }
  return { inside, outside }
}

function select(node: Node): void {
  const range = document.createRange()
  range.selectNodeContents(node)
  const selection = document.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

function releasePointer(): void {
  act(() => {
    fireEvent.pointerUp(document.body)
  })
}

describe("引いて聞く", () => {
  it("レポートの本文の中で字を選び終えると口が出る", () => {
    const { inside } = renderPage()
    select(inside)
    releasePointer()
    expect(screen.getByRole("button", { name: "引いて聞く" })).toBeDefined()
  })

  it("レポートの外の選択では出ない", () => {
    const { outside } = renderPage()
    select(outside)
    releasePointer()
    expect(screen.queryByRole("button", { name: "引いて聞く" })).toBeNull()
  })

  it("押すと下書きの頭に引用が入り、入力欄へフォーカスを送って口が消える", () => {
    const { inside } = renderPage()
    useComposerDraft.getState().setDraft({ text: "打ちかけ", caret: 0 })
    select(inside)
    releasePointer()
    fireEvent.click(screen.getByRole("button", { name: "引いて聞く" }))
    expect(useComposerDraft.getState().draft.text).toBe("> 架空のレポートの本文\n\n打ちかけ")
    expect(useComposerFocus.getState().signal).toBe(1)
    expect(screen.queryByRole("button", { name: "引いて聞く" })).toBeNull()
  })

  it("Escape・選択が消える・外を押すと消える", () => {
    const { inside } = renderPage()
    const shown = (): boolean => screen.queryByRole("button", { name: "引いて聞く" }) !== null

    select(inside)
    releasePointer()
    act(() => {
      fireEvent.keyDown(document, { key: "Escape" })
    })
    expect(shown()).toBe(false)

    select(inside)
    releasePointer()
    act(() => {
      document.getSelection()?.removeAllRanges()
      fireEvent(document, createEvent("selectionchange", document))
    })
    expect(shown()).toBe(false)

    select(inside)
    releasePointer()
    act(() => {
      fireEvent.pointerDown(document.body)
    })
    expect(shown()).toBe(false)
  })
})
