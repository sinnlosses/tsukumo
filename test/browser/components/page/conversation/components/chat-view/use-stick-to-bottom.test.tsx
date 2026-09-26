import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, fireEvent, render } from "@testing-library/react"
import { type ReactElement } from "react"

import { useStickToBottom } from "../../../../../../../src/browser/components/page/conversation/components/chat-view/hooks/use-stick-to-bottom.ts"

/**
 * ログ（`components/chat-log.tsx`）を描かずに、下端へ寄せる規則だけを測る
 * （docs/design.md 2章「機能の中を分ける」）。フックは入れ物の要素が要るので、ref を付けるだけの
 * 入れ物を置く。DOM の実装はレイアウトをしないので、高さとスクロール位置は手で与える。
 */

afterEach(() => {
  cleanup()
})

function Log(props: { readonly count: number }): ReactElement {
  const logRef = useStickToBottom(props.count)
  return <div ref={logRef} data-testid="log" />
}

/** 高さ `scrollHeight`・見えている高さ `clientHeight` の入れ物にする（位置は `scrollTop`）。 */
function giveSize(log: HTMLElement, scrollHeight: number, clientHeight: number): void {
  Object.defineProperty(log, "scrollHeight", { configurable: true, value: scrollHeight })
  Object.defineProperty(log, "clientHeight", { configurable: true, value: clientHeight })
}

function renderLog(count: number): {
  readonly log: HTMLElement
  readonly rerender: (count: number) => void
} {
  const view = render(<Log count={count} />)
  const log = view.getByTestId("log")
  return {
    log,
    rerender: (next) => {
      view.rerender(<Log count={next} />)
    },
  }
}

describe("useStickToBottom", () => {
  it("下端付近を読んでいたら、件数が増えたときに最新へ寄せる", () => {
    const { log, rerender } = renderLog(1)
    giveSize(log, 1000, 400)

    rerender(2)

    expect(log.scrollTop).toBe(1000)
  })

  it("読み返している最中（下端から離れている）なら、件数が増えても動かさない", () => {
    const { log, rerender } = renderLog(1)
    giveSize(log, 1000, 400)
    log.scrollTop = 100
    fireEvent.scroll(log)

    rerender(2)

    expect(log.scrollTop).toBe(100)
  })

  it("下端から少しだけ（120px 以内）離れているのは下端付近とみなす", () => {
    const { log, rerender } = renderLog(1)
    giveSize(log, 1000, 400)
    log.scrollTop = 480
    fireEvent.scroll(log)

    rerender(2)

    expect(log.scrollTop).toBe(1000)
  })
})
