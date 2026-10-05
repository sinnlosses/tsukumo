import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { BalloonTrack } from "../../../../../../../../../src/browser/components/page/conversation/components/character-view/components/balloon-track/balloon-track.tsx"
import type { CharacterViewSpeech } from "../../../../../../../../../src/browser/components/page/conversation/components/character-view/hooks/use-character-view.ts"

afterEach(() => {
  cleanup()
})

/** 押しても遡らない、印の付いていないセリフ。 */
function speech(text: string): CharacterViewSpeech {
  return { text, selected: false, onToggle: () => {} }
}

describe("BalloonTrack", () => {
  it("(2) セリフも反応も無いときは吹き出しを出さず、並びの器だけを残す", () => {
    render(<BalloonTrack speeches={[]} reaction={{ kind: "none" }} speakerName="架空の名前" />)

    expect(document.querySelector(".balloon-track")).not.toBeNull()
    expect(document.querySelectorAll(".balloon")).toHaveLength(0)
  })

  it("(4) セリフが増えても、既存のセリフの DOM ノードは自分のまま（別のセリフに差し替わらない）", () => {
    const { rerender } = render(
      <BalloonTrack
        speeches={[speech("1つめ")]}
        reaction={{ kind: "none" }}
        speakerName={undefined}
      />,
    )
    const firstNode = screen.getByText("1つめ")

    rerender(
      <BalloonTrack
        speeches={[speech("1つめ"), speech("2つめ")]}
        reaction={{ kind: "none" }}
        speakerName={undefined}
      />,
    )

    // 位置ベースの key（index）だと、この時点で最新の位置（先頭）のノードの中身だけが
    // 「1つめ」→「2つめ」に差し替わり、firstNode がそのまま「2つめ」を指してしまう
    // （React がノードを再利用するため）。古い側からの通し番号なら、firstNode は
    // 「1つめ」のノードのまま残る（:first-child から外れて非最新の見た目になるだけ）。
    expect(screen.getByText("1つめ")).toBe(firstNode)
    expect(firstNode.closest(".balloon")?.getAttribute("data-latest")).toBe("false")
    expect(screen.getByText("2つめ").closest(".balloon")?.getAttribute("data-latest")).toBe("true")
  })

  it("(6) 書いている途中（writing）は、セリフより新しい位置に話し手の名前付きの吹き出しが1つ出る", () => {
    render(
      <BalloonTrack
        speeches={[speech("前のセリフ")]}
        reaction={{ kind: "writing" }}
        speakerName="架空の名前"
      />,
    )

    const balloons = document.querySelectorAll(".balloon")
    expect(balloons).toHaveLength(2)
    const writing = balloons[0]
    expect(writing?.getAttribute("data-latest")).toBe("true")
    expect(writing?.getAttribute("data-writing")).toBe("true")
    expect(writing?.textContent).toContain("架空の名前")
    const previous = screen.getByText("前のセリフ").closest(".balloon")
    expect(previous?.getAttribute("data-latest")).toBe("false")
  })
})
