import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  DEFAULT_SPLIT,
  loadSplit,
  saveSplit,
} from "../../../../../../../../src/browser/components/page/conversation/components/conversation-layout/domain/split.ts"
import { useConversationLayout } from "../../../../../../../../src/browser/components/page/conversation/components/conversation-layout/hooks/use-conversation-layout.ts"
import { INITIAL_SESSION_STATE } from "../../../../../../../../src/shared/session/session-state.ts"
import { putSession, type SentCommand } from "../../../../../../session-store.ts"

/**
 * `<ConversationLayout>` を丸ごと描かずに、幅の state・ドラッグの読み替え・保存だけを測る
 * （docs/architecture.md「機能の中を分ける」）。DOM への直接書き込みが本物の要素で効くかは、
 * `<ConversationLayout>` の別のテスト（部品ごと描画する側）が確かめる。
 */

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  localStorage.clear()
})

describe("useConversationLayout", () => {
  it("初期状態は保存済みの幅を読む", () => {
    saveSplit({ leftPx: 300, sidebar: 30 })

    const { result } = renderHook(() => useConversationLayout())

    expect(result.current.splitters.gridStyle["--layout-left-width"]).toBe("300px")
    expect(result.current.splitters.gridStyle["--layout-sidebar-width"]).toBe("30%")
  })

  it("離した仕切りを保存し、既定に戻すと両方が戻る", () => {
    const { result } = renderHook(() => useConversationLayout())

    act(() => {
      result.current.splitters.left.onCommit(320)
    })
    expect(loadSplit()).toEqual({ ...DEFAULT_SPLIT, leftPx: 320 })

    act(() => {
      result.current.splitters.sidebar.onCommit(30)
    })
    expect(loadSplit()).toEqual({ leftPx: 320, sidebar: 30 })

    act(() => {
      result.current.splitters.onReset()
    })
    expect(loadSplit()).toEqual(DEFAULT_SPLIT)
  })

  it("サイドバーの仕切りを離すたびに1回だけ、メインの幅の比で体験の記録へ送る（動かしている途中は送らない）", async () => {
    saveSplit({ leftPx: 238, sidebar: 20 })
    const sent: SentCommand[] = []
    putSession(INITIAL_SESSION_STATE, (command) => {
      sent.push(command)
    })
    const { result } = renderHook(() => useConversationLayout())

    act(() => {
      result.current.splitters.sidebar.onChange(25)
      result.current.splitters.sidebar.onChange(30)
    })
    await flush()
    expect(sent).toEqual([])

    act(() => {
      result.current.splitters.sidebar.onCommit(30)
    })
    await flush()

    expect(sent).toEqual([
      {
        procedure: "experienceMetric.recordSplit",
        divider: "topLeft",
        releasedPercent: 70,
        previousPercent: 80,
      },
    ])
  })
})

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}
