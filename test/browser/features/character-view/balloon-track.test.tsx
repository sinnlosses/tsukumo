import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, render, screen } from "@testing-library/react"

import { BalloonTrack } from "../../../../src/browser/features/character-view/balloon-track.tsx"

// フィクスチャはすべて手で書いた架空のセリフ（docs/coding-standards.md「会話内容の扱い」）。

afterEach(() => {
  cleanup()
})

describe("BalloonTrack", () => {
  it("(1) 古い→新しいの順で渡したセリフが、DOM 上は新しい順（先頭が最新）で並ぶ", () => {
    render(<BalloonTrack speeches={["1つめ", "2つめ", "3つめ"]} emptyMessage={undefined} />)

    const balloons = document.querySelectorAll(".balloon")
    expect([...balloons].map((balloon) => balloon.textContent)).toEqual(["3つめ", "2つめ", "1つめ"])
  })

  it("(1) 最新の1件だけに強調の印（data-latest）が付く", () => {
    render(<BalloonTrack speeches={["1つめ", "2つめ", "3つめ"]} emptyMessage={undefined} />)

    const balloons = [...document.querySelectorAll(".balloon")]
    expect(balloons[0]?.getAttribute("data-latest")).toBe("true")
    expect(balloons[1]?.getAttribute("data-latest")).toBe("false")
    expect(balloons[2]?.getAttribute("data-latest")).toBe("false")
  })

  it("(2) セリフが0件のときはプレースホルダの文言を出す", () => {
    render(<BalloonTrack speeches={[]} emptyMessage={undefined} />)

    expect(screen.getByText("（まだ発話がありません）")).toBeDefined()
    expect(document.querySelectorAll(".balloon")).toHaveLength(1)
  })

  it("(3) セリフが0件で emptyMessage が渡ると、その文言を出す（過去のターン向け）", () => {
    render(<BalloonTrack speeches={[]} emptyMessage="（架空の文言）" />)

    expect(screen.getByText("（架空の文言）")).toBeDefined()
    expect(document.querySelectorAll(".balloon")).toHaveLength(1)
  })

  it("(4) セリフが増えても、既存のセリフの DOM ノードは自分のまま（別のセリフに差し替わらない）", () => {
    const { rerender } = render(<BalloonTrack speeches={["1つめ"]} emptyMessage={undefined} />)
    const firstNode = screen.getByText("1つめ")

    rerender(<BalloonTrack speeches={["1つめ", "2つめ"]} emptyMessage={undefined} />)

    // 位置ベースの key（index）だと、この時点で最新の位置（先頭）のノードの中身だけが
    // 「1つめ」→「2つめ」に差し替わり、firstNode がそのまま「2つめ」を指してしまう
    // （React がノードを再利用するため）。古い側からの通し番号なら、firstNode は
    // 「1つめ」のノードのまま残る（:first-child から外れて非最新の見た目になるだけ）。
    expect(screen.getByText("1つめ")).toBe(firstNode)
    expect(firstNode.getAttribute("data-latest")).toBe("false")
    expect(screen.getByText("2つめ").getAttribute("data-latest")).toBe("true")
  })
})
