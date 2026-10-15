import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { BalloonTrack } from "../../../../../../../../../src/browser/components/page/conversation/components/character-view/components/balloon-track/balloon-track.tsx"
import type { CharacterViewSpeech } from "../../../../../../../../../src/browser/components/page/conversation/components/character-view/hooks/use-character-view.ts"

afterEach(() => {
  cleanup()
})

/** 押しても遡らない、印の付いていないセリフ。 */
function speech(
  text: string,
  time: CharacterViewSpeech["time"] = { kind: "unknown" },
): CharacterViewSpeech {
  return { text, time, selected: false, onToggle: () => {} }
}

describe("BalloonTrack", () => {
  it("名前を添える最新の吹き出しは名前の隣に、過去の吹き出しは脇に時刻を出す", () => {
    const old = { kind: "known", dateTime: "2026-09-22T08:00", text: "9/22 08:00" } as const
    const known = { kind: "known", dateTime: "2026-09-23T09:07", text: "09:07" } as const
    render(
      <BalloonTrack
        speeches={[speech("古いセリフ", old), speech("新しいセリフ", known)]}
        reaction={{ kind: "none" }}
        speakerName="架空の名前"
      />,
    )

    const headTimes = [...document.querySelectorAll(".balloon time")]
    expect(headTimes.map((time) => time.textContent)).toEqual(["09:07"])
    expect(headTimes[0]?.closest(".balloon")?.getAttribute("data-latest")).toBe("true")
    expect(headTimes[0]?.previousElementSibling?.textContent).toBe("架空の名前")
    const sideTimes = [...document.querySelectorAll(".balloon-side-time")]
    expect(sideTimes.map((time) => time.textContent)).toEqual(["9/22 08:00"])
    expect(sideTimes[0]?.previousElementSibling?.textContent).toBe("古いセリフ")
  })

  it("名前が無いときは最新でも脇に出し、時刻が分からなければどこにも出さない", () => {
    const known = { kind: "known", dateTime: "2026-09-23T09:07", text: "09:07" } as const
    render(
      <BalloonTrack
        speeches={[speech("名前なし", known)]}
        reaction={{ kind: "none" }}
        speakerName={undefined}
      />,
    )
    expect(document.querySelectorAll(".balloon time")).toHaveLength(0)
    expect(document.querySelector(".balloon-side-time")?.textContent).toBe("09:07")

    cleanup()
    render(
      <BalloonTrack
        speeches={[speech("組み直した"), speech("組み直した2")]}
        reaction={{ kind: "none" }}
        speakerName="架空の名前"
      />,
    )
    expect(document.querySelectorAll("time")).toHaveLength(0)
  })

  it("反応の吹き出しにも、出し始めた時刻を名前の隣に出す", () => {
    const known = { kind: "known", dateTime: "2026-09-23T09:07", text: "09:07" } as const
    render(
      <BalloonTrack
        speeches={[]}
        reaction={{ kind: "shown", reaction: "idle", text: "架空の待ちの一言", time: known }}
        speakerName="架空の名前"
      />,
    )

    expect(document.querySelector("[data-reaction='idle'] time")?.textContent).toBe("09:07")
  })

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
