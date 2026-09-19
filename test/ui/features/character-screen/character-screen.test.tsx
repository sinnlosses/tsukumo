import { afterEach, beforeEach, describe, expect, it } from "bun:test"

import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { type PendingAsk } from "../../../../src/protocol/pending-ask.ts"
import { INITIAL_SESSION_STATE, type SessionState } from "../../../../src/protocol/session-state.ts"
import { CharacterScreen } from "../../../../src/ui/features/character-screen/character-screen.tsx"
import { SessionContext, type SessionContextValue } from "../../../../src/ui/stores/session.tsx"

const COLOR_STORAGE_KEY = "tsukumo-appearance-color"

// 手で書いた架空のキャラクターパック（docs/coding-standards.md「会話内容の扱い」）。
// **立ち絵は持たせない** — この画面の並びそのものは `character-edit.test.tsx` が見るので、
// ここでは戻る口・見出し・画面の色だけを見る。
const FIXTURE_CHARACTER: NonNullable<SessionState["character"]> = {
  pack: "fictional",
  name: "架空の精霊",
  accent: undefined,
  speechMarker: undefined,
  expressions: [{ name: "default", label: "通常" }],
  portraits: { default: undefined, thinking: undefined, proud: undefined, flustered: undefined },
  outfitAccents: { default: undefined, light: undefined, normal: undefined, heavy: undefined },
  editable: true,
}

// 手で書いた架空の答え待ち（許可の問い合わせ1件）。
const FIXTURE_PENDING: PendingAsk = {
  kind: "permission",
  id: "ask-1",
  toolName: "Read",
  input: {},
}

let themeStyleElement: HTMLStyleElement | undefined

beforeEach(() => {
  localStorage.removeItem(COLOR_STORAGE_KEY)
  document.documentElement.style.removeProperty("--ground")
  document.documentElement.style.removeProperty("--surface")
  document.documentElement.style.removeProperty("--ink")
  themeStyleElement = document.createElement("style")
  themeStyleElement.textContent =
    ":root { --ground: #191720; --surface: #221f2b; --ink: #e8e3ea; --accent: #f2b0a0; }"
  document.head.appendChild(themeStyleElement)
})

afterEach(() => {
  cleanup()
  localStorage.removeItem(COLOR_STORAGE_KEY)
  document.documentElement.style.removeProperty("--ground")
  document.documentElement.style.removeProperty("--surface")
  document.documentElement.style.removeProperty("--ink")
  themeStyleElement?.remove()
  themeStyleElement = undefined
})

function renderCharacterScreen(state: Partial<SessionState> = {}): void {
  const value: SessionContextValue = {
    state: { ...INITIAL_SESSION_STATE, character: FIXTURE_CHARACTER, ...state },
    connection: "open",
    dispatch: () => {},
  }
  render(
    <SessionContext.Provider value={value}>
      <CharacterScreen />
    </SessionContext.Provider>,
  )
}

describe("CharacterScreen", () => {
  it("会話へ戻る口と、パックのラベル・名前・「新しく作る」を出す", () => {
    renderCharacterScreen()

    expect(screen.getByRole("link", { name: "← 会話へ戻る" }).getAttribute("href")).toBe("#")
    expect(screen.getByRole("link", { name: "新しく作る" }).getAttribute("href")).toBe(
      "#character/new",
    )
    expect(document.querySelector(".character-screen-label")?.textContent).toBe("架空の精霊")
    expect(document.querySelector(".character-screen-pack")?.textContent).toBe("fictional")
  })

  // 隠れている間も会話は進み続けるので、答え待ちが来たことは戻る口のそばで分かる必要がある
  // （docs/design.md 13.6）。**色だけにしない**ので字も見る。
  it("答え待ちがあるときだけ、戻る口の横に印を出す", () => {
    renderCharacterScreen()
    expect(document.querySelector(".character-screen-pending")).toBeNull()

    cleanup()
    renderCharacterScreen({ pending: [FIXTURE_PENDING] })

    expect(document.querySelector(".character-screen-pending")?.textContent).toBe("答え待ち")
  })

  it("画面の色を変えると documentElement に反映し、localStorage に残る", () => {
    renderCharacterScreen()

    fireEvent.change(screen.getByLabelText("画面の地"), { target: { value: "#101010" } })

    expect(getComputedStyle(document.documentElement).getPropertyValue("--ground").trim()).toBe(
      "#101010",
    )
    expect(JSON.parse(localStorage.getItem(COLOR_STORAGE_KEY) ?? "{}")).toEqual({
      ground: "#101010",
      surface: undefined,
      ink: undefined,
    })
  })

  it("ground を ink と同じ色にしようとすると受け取らず、既定へ落ちる", () => {
    renderCharacterScreen()

    // 疑似 :root の --ink は #e8e3ea。同じ値にしようとする。
    fireEvent.change(screen.getByLabelText("画面の地"), { target: { value: "#e8e3ea" } })

    expect(getComputedStyle(document.documentElement).getPropertyValue("--ground").trim()).toBe(
      "#191720",
    )
    expect(JSON.parse(localStorage.getItem(COLOR_STORAGE_KEY) ?? "{}")).toEqual({
      ground: undefined,
      surface: undefined,
      ink: undefined,
    })
  })

  // キャラクターが届く前でも行き止まりにしない（戻る口と作る口だけは出す）。
  it("キャラクターが届く前でも戻る口を出す", () => {
    renderCharacterScreen({ character: undefined })

    expect(screen.getByRole("link", { name: "← 会話へ戻る" })).toBeDefined()
    expect(document.querySelector(".character-screen-label")).toBeNull()
  })
})
