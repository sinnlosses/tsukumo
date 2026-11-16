import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ComposerShell } from "../../../../../src/browser/components/ui/composer-shell/composer-shell.tsx"
import { RoundButton } from "../../../../../src/browser/components/ui/round-button/round-button.tsx"

afterEach(() => {
  cleanup()
})

describe("ComposerShell", () => {
  it("入力が空でも、差し込んだ送信ボタンは押せて、form を送る（画像だけの下書きを送れる）", () => {
    const onSubmit = vi.fn<() => void>()
    render(
      <form
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit()
        }}
      >
        <ComposerShell
          input={<textarea aria-label="入力" />}
          tools={<span>道具</span>}
          actions={
            <RoundButton
              action={{ kind: "submit" }}
              ariaLabel="送信"
              title="送信"
              disabled={false}
              emphasis="solid"
              className=""
            >
              ↑
            </RoundButton>
          }
          className=""
        />
      </form>,
    )
    const send = screen.getByRole("button", { name: "送信" })
    expect(send.hasAttribute("disabled")).toBe(false)
    fireEvent.click(send)
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })
})

describe("RoundButton", () => {
  it("aria-label と強さの印を持ち、押すと onClick を呼ぶ", () => {
    const onClick = vi.fn<() => void>()
    render(
      <RoundButton
        action={{ kind: "press", onClick }}
        ariaLabel="中断"
        title="中断"
        disabled={false}
        emphasis="neutral"
        className=""
      >
        ■
      </RoundButton>,
    )
    const button = screen.getByRole("button", { name: "中断" })
    expect(button.dataset["emphasis"]).toBe("neutral")
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
