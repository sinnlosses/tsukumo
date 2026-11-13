import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { TalkFlowRow } from "../../../../../../../src/browser/components/page/conversation/components/character-view/domain/talk-flow.ts"
import { PresentationalTalkFlow } from "../../../../../../../src/browser/components/page/conversation/components/character-view/presentational-talk-flow.tsx"

afterEach(() => {
  cleanup()
})

const TIME = { kind: "known", dateTime: "2026-01-01T10:00", text: "10:00" } as const

function you(text: string): TalkFlowRow {
  return { kind: "you", key: `you-${text}`, turnId: 0, time: TIME, text }
}

function her(text: string, finished: boolean): TalkFlowRow {
  return {
    kind: "her",
    key: `her-${text}`,
    turnId: 0,
    time: TIME,
    text,
    target: { turnId: 0, index: 0 },
    finishedStep: finished ? { kind: "finished", turnId: 0, stepId: 1 } : { kind: "none" },
  }
}

describe("PresentationalTalkFlow（舞台のやり取りの流れ）", () => {
  it("利用者の行とキャラクターの行を並べ、段を終えた行にだけ狐火を付けて押せるようにする", () => {
    const onJumpToStep = vi.fn<(target: { turnId: number; stepId: number }) => void>()
    const { container } = render(
      <PresentationalTalkFlow
        rows={[you("架空の依頼"), her("架空の着手", false), her("架空の区切り", true)]}
        onOpenSpeechLog={() => {}}
        onJumpToStep={onJumpToStep}
      />,
    )

    const lines = [...container.querySelectorAll("[data-who]")]
    expect(lines.map((line) => line.getAttribute("data-who"))).toEqual(["you", "her", "her"])
    expect(lines.map((line) => line.querySelector("svg") !== null)).toEqual([false, false, true])
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "10:00架空の区切り",
    ])

    fireEvent.click(screen.getByRole("button", { name: /架空の区切り/u }))

    expect(onJumpToStep).toHaveBeenCalledWith({ turnId: 0, stepId: 1 })
  })

  it("行が4つ以上あれば「これまでのやり取り」の札が出て、押すとセリフのログを開く", () => {
    const onOpenSpeechLog = vi.fn<() => void>()
    render(
      <PresentationalTalkFlow
        rows={[
          you("架空の依頼"),
          her("架空の一", false),
          her("架空の二", false),
          you("架空の補足"),
        ]}
        onOpenSpeechLog={onOpenSpeechLog}
        onJumpToStep={() => {}}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: /これまでのやり取り/u }))

    expect(onOpenSpeechLog).toHaveBeenCalledOnce()
  })
})
