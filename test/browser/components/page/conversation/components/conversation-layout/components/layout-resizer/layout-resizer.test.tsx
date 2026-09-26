import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { useRef, useState, type ReactElement } from "react"

import { LayoutResizer } from "../../../../../../../../../src/browser/components/page/conversation/components/conversation-layout/components/layout-resizer/layout-resizer.tsx"

type HostProps = {
  readonly onCommit: (moves: number, percent: number) => void
}

/**
 * ドラッグの最中に描き直される親。`pointerdown` で登録したリスナが当時の props を握ったままだと、
 * `onCommit` は描き直す前の `moves` で呼ばれる。
 */
function Host(props: HostProps): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)
  const [moves, setMoves] = useState(0)
  return (
    <div ref={containerRef}>
      <LayoutResizer
        orientation="vertical"
        containerRef={containerRef}
        ariaLabel="仕切り"
        onChange={() => {
          setMoves((current) => current + 1)
        }}
        onCommit={(percent) => {
          props.onCommit(moves, percent)
        }}
      />
    </div>
  )
}

afterEach(() => {
  cleanup()
})

describe("LayoutResizer", () => {
  it("ドラッグ中に親が描き直されても、離したときに呼ぶのは最新の onCommit", () => {
    const committed: { moves: number; percent: number }[] = []
    render(
      <Host
        onCommit={(moves, percent) => {
          committed.push({ moves, percent })
        }}
      />,
    )
    const resizer = screen.getByRole("separator", { name: "仕切り" })
    const container = resizer.parentElement
    if (container === null) {
      throw new Error("container が見つからない")
    }
    Object.defineProperty(container, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ top: 0, left: 0, width: 1000, height: 400, right: 1000, bottom: 400 }),
    })

    fireEvent.pointerDown(resizer, { pointerId: 1, clientX: 500, clientY: 0 })
    fireEvent.pointerMove(resizer, { clientX: 400, clientY: 0 })
    fireEvent.pointerMove(resizer, { clientX: 300, clientY: 0 })
    fireEvent.pointerUp(resizer, { clientX: 300, clientY: 0 })

    expect(committed).toEqual([{ moves: 2, percent: 30 }])
  })
})
