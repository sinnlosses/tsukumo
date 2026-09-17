import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, render, screen } from "@testing-library/react"

import { BalloonTrack } from "../../../../src/ui/features/character-view/balloon-track.tsx"

// フィクスチャはすべて手で書いた架空のセリフ（docs/coding-standards.md「会話内容の扱い」）。

afterEach(() => {
  cleanup()
})

describe("BalloonTrack", () => {
  it("(1) 古い→新しいの順で渡したセリフが、DOM 上は新しい順（先頭が最新）で並ぶ", () => {
    render(
      <BalloonTrack
        speeches={["1つめ", "2つめ", "3つめ"]}
        emptyMessage={undefined}
        workingSpeech={undefined}
      />,
    )

    const balloons = document.querySelectorAll(".balloon")
    expect([...balloons].map((balloon) => balloon.textContent)).toEqual(["3つめ", "2つめ", "1つめ"])
  })

  it("(1) 最新の1件だけに強調の印（data-latest）が付く", () => {
    render(
      <BalloonTrack
        speeches={["1つめ", "2つめ", "3つめ"]}
        emptyMessage={undefined}
        workingSpeech={undefined}
      />,
    )

    const balloons = [...document.querySelectorAll(".balloon")]
    expect(balloons[0]?.getAttribute("data-latest")).toBe("true")
    expect(balloons[1]?.getAttribute("data-latest")).toBe("false")
    expect(balloons[2]?.getAttribute("data-latest")).toBe("false")
  })

  it("workingSpeech を渡すと、いちばん新しい吹き出しとして重なる（セリフには積まない）", () => {
    render(
      <BalloonTrack
        speeches={["1つめ", "2つめ"]}
        emptyMessage={undefined}
        workingSpeech="（架空の作業中の一言）"
      />,
    )

    const balloons = [...document.querySelectorAll(".balloon")]
    expect(balloons.map((balloon) => balloon.textContent)).toEqual([
      "（架空の作業中の一言）",
      "2つめ",
      "1つめ",
    ])
    expect(balloons[0]?.getAttribute("data-latest")).toBe("true")
  })

  it("セリフが0件でも workingSpeech があれば、プレースホルダの代わりにそれだけが出る", () => {
    render(
      <BalloonTrack
        speeches={[]}
        emptyMessage={undefined}
        workingSpeech="（架空の作業中の一言）"
      />,
    )

    expect(document.querySelectorAll(".balloon")).toHaveLength(1)
    expect(screen.getByText("（架空の作業中の一言）")).toBeDefined()
  })

  it("(2) セリフが0件のときはプレースホルダの文言を出す", () => {
    render(<BalloonTrack speeches={[]} emptyMessage={undefined} workingSpeech={undefined} />)

    expect(screen.getByText("（まだ発話がありません）")).toBeDefined()
    expect(document.querySelectorAll(".balloon")).toHaveLength(1)
  })

  it("(3) セリフが0件で emptyMessage が渡ると、その文言を出す（過去のターン向け）", () => {
    render(<BalloonTrack speeches={[]} emptyMessage="（架空の文言）" workingSpeech={undefined} />)

    expect(screen.getByText("（架空の文言）")).toBeDefined()
    expect(document.querySelectorAll(".balloon")).toHaveLength(1)
  })
})
