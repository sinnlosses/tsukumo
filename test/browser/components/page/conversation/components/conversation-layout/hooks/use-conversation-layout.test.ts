import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  DEFAULT_SPLIT,
  saveSplit,
} from "../../../../../../../../src/browser/components/page/conversation/components/conversation-layout/domain/split.ts"
import { useConversationLayout } from "../../../../../../../../src/browser/components/page/conversation/components/conversation-layout/hooks/use-conversation-layout.ts"
import { INITIAL_SESSION_STATE } from "../../../../../../../../src/shared/session/session-state.ts"
import { putSession, type SentCommand } from "../../../../../../session-store.ts"

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
  it("初期状態は保存済みの比率を読む", () => {
    saveSplit({ ...DEFAULT_SPLIT, rowTop: 40, topLeft: 20, bottomLeft: 70 })

    const { result } = renderHook(() => useConversationLayout(false))

    expect(result.current.splitters.rowTop.style["--layout-row-top"]).toBe("40fr")
    expect(result.current.splitters.topLeft.style["--layout-top-left"]).toBe("20fr")
    expect(result.current.splitters.bottomLeft.style["--layout-bottom-left"]).toBe("70fr")
  })

  it("畳んでいて雑談用の比率がまだ無いときは、gridStyle が仕事の比率で組み立つ", () => {
    saveSplit({ ...DEFAULT_SPLIT, rowTop: 35 })

    const { result } = renderHook(() => useConversationLayout(true))

    expect(result.current.splitters.rowTop.style["--layout-row-top"]).toBe("35fr")
    expect(result.current.splitters.rowTop.style["--layout-row-bottom"]).toBe("65fr")
  })

  it("仕切りを離すたびに1回だけ、離した比率と動かす前の比率を体験の記録へ送る（動かしている途中は送らない）", async () => {
    saveSplit({ ...DEFAULT_SPLIT, rowTop: 40, topLeft: 20, bottomLeft: 70 })
    const sent: SentCommand[] = []
    putSession(INITIAL_SESSION_STATE, (command) => {
      sent.push(command)
    })
    const { result } = renderHook(() => useConversationLayout(false))

    act(() => {
      result.current.splitters.topLeft.onChange(25)
      result.current.splitters.topLeft.onChange(30)
    })
    await flush()
    expect(sent).toEqual([])

    act(() => {
      result.current.splitters.topLeft.onCommit(30)
    })
    act(() => {
      result.current.splitters.rowTop.onCommit(50)
    })
    act(() => {
      result.current.splitters.bottomLeft.onCommit(60)
    })
    await flush()

    expect(sent).toEqual([
      {
        procedure: "experienceMetric.recordSplit",
        divider: "topLeft",
        releasedPercent: 30,
        previousPercent: 20,
      },
      {
        procedure: "experienceMetric.recordSplit",
        divider: "rowTop",
        releasedPercent: 50,
        previousPercent: 40,
      },
      {
        procedure: "experienceMetric.recordSplit",
        divider: "bottomLeft",
        releasedPercent: 60,
        previousPercent: 70,
      },
    ])
  })
})

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}
