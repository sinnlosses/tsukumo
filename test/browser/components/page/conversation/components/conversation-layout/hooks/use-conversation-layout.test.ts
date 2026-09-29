import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  DEFAULT_SPLIT,
  loadSplit,
  saveSplit,
} from "../../../../../../../../src/browser/components/page/conversation/components/conversation-layout/domain/split.ts"
import { useConversationLayout } from "../../../../../../../../src/browser/components/page/conversation/components/conversation-layout/hooks/use-conversation-layout.ts"

/**
 * `<ConversationLayout>` を丸ごと描かずに、比率の state・ドラッグの読み替え・保存だけを測る
 * （docs/architecture.md「機能の中を分ける」）。DOM への直接書き込み（`writeFraction`）と
 * `style` の組み立て（`fractionStyle`）が本物の要素・レンダーで効くかは、`<ConversationLayout>` の
 * 別のテスト（部品ごと描画する側）が確かめる。
 */

beforeEach(() => {
  saveSplit(DEFAULT_SPLIT)
})

afterEach(() => {
  saveSplit(DEFAULT_SPLIT)
})

describe("useConversationLayout", () => {
  it("初期状態は保存済みの比率を読み、狭い画面のタブはメインビュー", () => {
    saveSplit({ ...DEFAULT_SPLIT, rowTop: 40, topLeft: 20, bottomLeft: 70 })

    const { result } = renderHook(() => useConversationLayout(false))

    expect(result.current.narrowPane).toBe("main")
    expect(result.current.gridStyle["--layout-row-top"]).toBe("40fr")
    expect(result.current.rowTopStyle["--layout-top-left"]).toBe("20fr")
    expect(result.current.rowBottomStyle["--layout-bottom-left"]).toBe("70fr")
  })

  it("畳んでいないとき、onRowTopCommit は rowTop を更新し collapsedRowTop は動かさない", () => {
    saveSplit({ ...DEFAULT_SPLIT, collapsedRowTop: 80 })
    const { result } = renderHook(() => useConversationLayout(false))

    act(() => {
      result.current.onRowTopCommit(45)
    })

    expect(loadSplit()).toEqual({ ...DEFAULT_SPLIT, rowTop: 45, collapsedRowTop: 80 })
  })

  it("畳んでいるとき、onRowTopCommit は collapsedRowTop だけを更新する", () => {
    saveSplit({ ...DEFAULT_SPLIT, rowTop: 60 })
    const { result } = renderHook(() => useConversationLayout(true))

    act(() => {
      result.current.onRowTopCommit(80)
    })

    expect(loadSplit()).toEqual({ ...DEFAULT_SPLIT, rowTop: 60, collapsedRowTop: 80 })
  })

  it("畳んでいて雑談用の比率がまだ無いときは、gridStyle が仕事の比率で組み立つ", () => {
    saveSplit({ ...DEFAULT_SPLIT, rowTop: 35 })

    const { result } = renderHook(() => useConversationLayout(true))

    expect(result.current.gridStyle["--layout-row-top"]).toBe("35fr")
    expect(result.current.gridStyle["--layout-row-bottom"]).toBe("65fr")
  })

  it("onReset は雑談用の比率も含めて DEFAULT_SPLIT に戻す", () => {
    saveSplit({ ...DEFAULT_SPLIT, rowTop: 20, collapsedRowTop: 80 })
    const { result } = renderHook(() => useConversationLayout(true))

    act(() => {
      result.current.onReset()
    })

    expect(loadSplit()).toEqual(DEFAULT_SPLIT)
  })

  it("ref が未接続のときの onChange は書き込み先が無いだけで落ちない", () => {
    const { result } = renderHook(() => useConversationLayout(false))

    expect(() => {
      act(() => {
        result.current.onBottomLeftChange(30)
      })
    }).not.toThrow()
  })
})
