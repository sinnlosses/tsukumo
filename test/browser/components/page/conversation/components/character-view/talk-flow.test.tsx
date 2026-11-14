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
        onOpenTurn={() => {}}
      />,
    )

    const lines = [...container.querySelectorAll("[data-who]")]
    expect(lines.map((line) => line.getAttribute("data-who"))).toEqual(["you", "her", "her"])
    expect(lines.map((line) => line.querySelector("svg") !== null)).toEqual([false, false, true])
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "あなた架空の依頼",
      "10:00架空の区切り",
    ])

    fireEvent.click(screen.getByRole("button", { name: /架空の区切り/u }))

    expect(onJumpToStep).toHaveBeenCalledWith({ turnId: 0, stepId: 1 })
  })

  it("依頼の行は回への入口で、押すとその回の番号で onOpenTurn が呼ばれ、見ている回の行に aria-current が付く", () => {
    const onOpenTurn = vi.fn<(turnId: number) => void>()
    render(
      <PresentationalTalkFlow
        rows={[
          { ...you("架空の一回目"), turnId: 3 },
          { ...you("架空の二回目"), turnId: 4 },
        ]}
        activeTurnId={4}
        onOpenSpeechLog={() => {}}
        onJumpToStep={() => {}}
        onOpenTurn={onOpenTurn}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: /架空の一回目/u }))

    expect(onOpenTurn).toHaveBeenCalledWith(3)
    expect(screen.getByRole("button", { name: /架空の二回目/u }).getAttribute("aria-current")).toBe(
      "true",
    )
    expect(
      screen.getByRole("button", { name: /架空の一回目/u }).getAttribute("aria-current"),
    ).toBeNull()
  })

  it("見ている回の依頼の行は、切れていれば「続きを読む」で全文が開き「畳む」に替わり、回を開く操作は呼ばない", () => {
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(200)
    const onOpenTurn = vi.fn<(turnId: number) => void>()
    render(
      <PresentationalTalkFlow
        rows={[{ ...you("架空の長い依頼"), turnId: 4 }]}
        activeTurnId={4}
        onOpenSpeechLog={() => {}}
        onJumpToStep={() => {}}
        onOpenTurn={onOpenTurn}
      />,
    )

    const more = screen.getByRole("button", { name: "続きを読む" })
    expect(more.getAttribute("aria-expanded")).toBe("false")
    fireEvent.click(more)

    const fold = screen.getByRole("button", { name: "畳む" })
    expect(fold.getAttribute("aria-expanded")).toBe("true")
    expect(onOpenTurn).not.toHaveBeenCalled()
  })

  it("ほかの回の行と、切れていない見ている回の行には「続きを読む」が出ない", () => {
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(200)
    const { rerender } = render(
      <PresentationalTalkFlow
        rows={[{ ...you("架空の一回目"), turnId: 3 }]}
        activeTurnId={4}
        onOpenSpeechLog={() => {}}
        onJumpToStep={() => {}}
        onOpenTurn={() => {}}
      />,
    )
    expect(screen.queryByRole("button", { name: "続きを読む" })).toBeNull()

    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(0)
    rerender(
      <PresentationalTalkFlow
        rows={[{ ...you("架空の短い依頼"), turnId: 4 }]}
        activeTurnId={4}
        onOpenSpeechLog={() => {}}
        onJumpToStep={() => {}}
        onOpenTurn={() => {}}
      />,
    )
    expect(screen.queryByRole("button", { name: "続きを読む" })).toBeNull()
  })

  it("画像の縮小版は、見ている回の依頼の行にだけ出る", () => {
    const images = [{ kind: "sent", id: "a", thumbnail: "data:image/png;base64,AAAA" }] as const
    render(
      <PresentationalTalkFlow
        rows={[
          { kind: "you", key: "a", turnId: 3, time: TIME, text: "架空の一回目", images },
          { kind: "you", key: "b", turnId: 4, time: TIME, text: "架空の二回目", images },
        ]}
        activeTurnId={4}
        onOpenSpeechLog={() => {}}
        onJumpToStep={() => {}}
        onOpenTurn={() => {}}
      />,
    )

    expect(screen.getAllByRole("img")).toHaveLength(1)
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
        onOpenTurn={() => {}}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: /これまでのやり取り/u }))

    expect(onOpenSpeechLog).toHaveBeenCalledOnce()
  })
})
