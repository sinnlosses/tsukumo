import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import type { CharacterViewSpeech } from "../../../../../../../src/browser/components/page/conversation/components/character-view/hooks/use-character-view.ts"
import { StageBalloon } from "../../../../../../../src/browser/components/page/conversation/components/character-view/stage-balloon.tsx"

afterEach(() => {
  cleanup()
})

function speech(text: string): CharacterViewSpeech {
  return { text, time: { kind: "unknown" }, selected: false, target: undefined }
}

function NOOP(): void {
  // 押しを見ないテスト用。
}

describe("StageBalloon", () => {
  it("セリフの最後の1件だけを吹き出しに出し、下に手元の行を続ける", () => {
    render(
      <StageBalloon
        speeches={[speech("古いセリフ"), speech("新しいセリフ")]}
        reaction={{ kind: "none" }}
        onToggleSpeech={NOOP}
        hands={<p>手元の行</p>}
      />,
    )

    expect(screen.getByText("新しいセリフ")).toBeTruthy()
    expect(screen.queryByText("古いセリフ")).toBeNull()
    expect(screen.getByText("手元の行")).toBeTruthy()
    expect(document.querySelector("[data-has-balloon]")?.getAttribute("data-has-balloon")).toBe(
      "true",
    )
  })

  it("反応があればセリフより反応を出す", () => {
    render(
      <StageBalloon
        speeches={[speech("セリフ")]}
        reaction={{
          kind: "shown",
          reaction: "idle",
          text: "架空の待ちの一言",
          time: { kind: "unknown" },
        }}
        onToggleSpeech={NOOP}
      />,
    )

    expect(screen.getByText("架空の待ちの一言")).toBeTruthy()
    expect(screen.queryByText("セリフ")).toBeNull()
  })

  it("吹き出しが無いときは、手元の行だけを紙に載せる", () => {
    render(
      <StageBalloon
        speeches={[]}
        reaction={{ kind: "none" }}
        onToggleSpeech={NOOP}
        hands={<p>待ちの行</p>}
      />,
    )

    expect(document.querySelector("[data-has-balloon]")?.getAttribute("data-has-balloon")).toBe(
      "false",
    )
    expect(document.querySelector("[data-has-balloon]")?.textContent).toBe("待ちの行")
    expect(screen.getByText("待ちの行")).toBeTruthy()
  })
})
