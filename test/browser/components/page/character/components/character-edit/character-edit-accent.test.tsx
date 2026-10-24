import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { typedElement } from "../../../../../../typed-element.ts"
import {
  FIXTURE_CHARACTER,
  renderCharacterEdit,
  setUpCharacterEditScreen,
} from "./character-edit-screen.tsx"

describe("CharacterEdit の差し色", () => {
  setUpCharacterEditScreen()

  // 画面を開いただけでは何も送らない（`docs/coding-standards.md`「useEffect は4類型だけ」の
  // タイマーは効かせるが、起こすのは onChange だけ）。
  it("開いただけでは何も送らない", async () => {
    vi.useFakeTimers()
    try {
      const calls: unknown[] = []
      renderCharacterEdit(FIXTURE_CHARACTER, (command) => calls.push(command))

      await vi.advanceTimersByTimeAsync(250)

      expect(calls).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })

  // 引きずったまま画面を閉じても、まだ送っていない最後の値を落とさない
  // （`useDebouncedCallback` のアンマウント時のフラッシュ）。
  it("送信前に画面を閉じても、待っていた最後の値をそのまま送る", () => {
    const calls: unknown[] = []
    renderCharacterEdit(FIXTURE_CHARACTER, (command) => calls.push(command))

    fireEvent.change(screen.getByLabelText("仕事"), { target: { value: "#123456" } })
    expect(calls).toEqual([])
    cleanup()

    expect(calls).toEqual([
      {
        procedure: "characterPack.setAccent",
        pack: "fictional",
        target: "work",
        color: "#123456",
      },
    ])
  })

  it("画面の差し色（仕事 / 雑談）の口を出す", () => {
    renderCharacterEdit({ ...FIXTURE_CHARACTER, accent: "#f2b0a0", chatAccent: "#f2984a" })

    expect(
      typedElement(screen.getByLabelText("仕事"), HTMLInputElement, "仕事の入力欄").value,
    ).toBe("#f2b0a0")
    expect(
      typedElement(screen.getByLabelText("雑談"), HTMLInputElement, "雑談の入力欄").value,
    ).toBe("#f2984a")
    expect(screen.getByRole("button", { name: "雑談も仕事と同じにする" })).toBeDefined()
    expect(screen.queryByText("雑談も仕事と同じ")).toBeNull()
    // 色だけにせず、今の値を16進の字でも添える。
    expect(screen.getByText("#f2984a")).toBeDefined()
  })

  it("chatAccent が無いパックでは、雑談の見本に仕事の差し色と「雑談も仕事と同じ」の字を出し、戻す口は出さない", () => {
    renderCharacterEdit({ ...FIXTURE_CHARACTER, accent: "#f2b0a0", chatAccent: undefined })

    expect(
      typedElement(screen.getByLabelText("雑談"), HTMLInputElement, "雑談の入力欄").value,
    ).toBe("#f2b0a0")
    expect(screen.queryByRole("button", { name: "雑談も仕事と同じにする" })).toBeNull()
    // 色見本が仕事と同じ色なのを、色だけでなく字でも伝える（13.1 原則1）。
    expect(screen.getByText("雑談も仕事と同じ")).toBeDefined()
  })

  it("仕事の差し色を変えると、少し待ってから characterPack.setAccent（target: work）を dispatch する", async () => {
    const calls: unknown[] = []
    renderCharacterEdit(FIXTURE_CHARACTER, (command) => calls.push(command))

    fireEvent.change(screen.getByLabelText("仕事"), { target: { value: "#123456" } })
    expect(calls).toEqual([])

    await waitFor(() => {
      expect(calls).toEqual([
        {
          procedure: "characterPack.setAccent",
          pack: "fictional",
          target: "work",
          color: "#123456",
        },
      ])
    })
  })

  it("「雑談も仕事と同じにする」を押すと characterPack.clearChatAccent を dispatch する", () => {
    const calls: unknown[] = []
    renderCharacterEdit({ ...FIXTURE_CHARACTER, chatAccent: "#f2984a" }, (command) =>
      calls.push(command),
    )

    fireEvent.click(screen.getByRole("button", { name: "雑談も仕事と同じにする" }))

    expect(calls).toEqual([{ procedure: "characterPack.clearChatAccent", pack: "fictional" }])
  })

  it("画面から変えられないパックでは、画面の差し色と戻す口も操作できない", () => {
    renderCharacterEdit({ ...FIXTURE_CHARACTER, chatAccent: "#f2984a", editable: false })

    expect(
      typedElement(screen.getByLabelText("仕事"), HTMLInputElement, "仕事の入力欄").disabled,
    ).toBe(true)
    expect(
      typedElement(screen.getByLabelText("雑談"), HTMLInputElement, "雑談の入力欄").disabled,
    ).toBe(true)
    expect(
      screen.getByRole("button", { name: "雑談も仕事と同じにする" }).getAttribute("aria-disabled"),
    ).toBe("true")
  })

  it("差し色がまったく無いパックでは、--accent の値を初期値にする（JS 側に既定の色を持たない）", () => {
    renderCharacterEdit({ ...FIXTURE_CHARACTER, accent: undefined })

    expect(
      typedElement(screen.getByLabelText("仕事"), HTMLInputElement, "仕事の入力欄").value,
    ).toBe("#f2b0a0")
  })
})
