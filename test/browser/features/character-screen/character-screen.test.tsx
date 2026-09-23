import { afterEach, beforeEach, describe, expect, it } from "bun:test"

import { cleanup, render, screen } from "@testing-library/react"

import { CharacterScreen } from "../../../../src/browser/features/character-screen/character-screen.tsx"
import { SessionStoreContext } from "../../../../src/browser/stores/session.tsx"
import { type PendingAsk } from "../../../../src/shared/pending-ask.ts"
import { INITIAL_SESSION_STATE, type SessionState } from "../../../../src/shared/session-state.ts"
import { characterInfo } from "../../../fixture/character.ts"
import { sessionStoreWith } from "../../session-store.ts"

// 手で書いた架空のキャラクターパック（docs/coding-standards.md「会話内容の扱い」）。
// **立ち絵は持たせない** — この画面の並びそのものは `character-edit.test.tsx` が見るので、
// ここでは戻る口・見出しと、**この画面に何が残っているか**だけを見る。
const FIXTURE_CHARACTER: NonNullable<SessionState["character"]> = characterInfo()

// 手で書いた架空の答え待ち（許可の問い合わせ1件）。
const FIXTURE_PENDING: PendingAsk = {
  kind: "permission",
  id: "ask-1",
  toolName: "Read",
  input: {},
}

let themeStyleElement: HTMLStyleElement | undefined

// 差し色の `<input type="color">` は定義に無い衣装の初期値を `--accent` から読む
// （`browser/lib/appearance-color.ts` の `readAccentColor`）ので、`:root` を疑似的に用意する。
beforeEach(() => {
  themeStyleElement = document.createElement("style")
  themeStyleElement.textContent =
    ":root { --ground: #191720; --surface: #221f2b; --ink: #e8e3ea; --accent: #f2b0a0; }"
  document.head.appendChild(themeStyleElement)
})

afterEach(() => {
  cleanup()
  themeStyleElement?.remove()
  themeStyleElement = undefined
})

function renderCharacterScreen(state: Partial<SessionState> = {}): void {
  const store = sessionStoreWith({
    ...INITIAL_SESSION_STATE,
    character: FIXTURE_CHARACTER,
    ...state,
  })
  render(
    <SessionStoreContext.Provider value={store}>
      <CharacterScreen />
    </SessionStoreContext.Provider>,
  )
}

describe("CharacterScreen", () => {
  it("パックのラベル・名前・「新しく作る」を出す", () => {
    renderCharacterScreen()

    expect(screen.getByRole("link", { name: "新しく作る" }).getAttribute("href")).toBe(
      "#character/new",
    )
    expect(document.querySelector(".character-screen-label")?.textContent).toBe("架空の精霊")
    expect(document.querySelector(".character-screen-pack")?.textContent).toBe("fictional")
  })

  // 戻る口と答え待ちの印は帯（`features/screen-nav/`）へ移った（docs/design.md 13.9）。
  // 同じ口を2つ置かないので、この画面には残っていない。
  it("会話へ戻る口と答え待ちの印は持たない", () => {
    renderCharacterScreen({ pending: [FIXTURE_PENDING] })

    expect(document.querySelector('a[href="#"]')).toBeNull()
    expect(document.querySelector(".character-screen-pending")).toBeNull()
  })

  // 地・領域・字の色は帯の歯車へ移り（13.6 の表）、**パックの持ち物である差し色だけが残る**。
  it("地・領域・字の色の操作子は持たず、差し色は残る", () => {
    renderCharacterScreen()

    expect(screen.queryByLabelText("画面の地")).toBeNull()
    expect(screen.queryByLabelText("領域の地")).toBeNull()
    expect(screen.queryByLabelText("字の色")).toBeNull()

    const legends = [...document.querySelectorAll("fieldset > legend")].map(
      (node) => node.textContent,
    )
    expect(legends).toContain("差し色")
    expect(legends).not.toContain("画面の色")
  })

  // キャラクターが届く前でも行き止まりにしない（作る口だけは出す。会話へ戻る口は帯にある）。
  it("キャラクターが届く前でも作る口を出す", () => {
    renderCharacterScreen({ character: undefined })

    expect(screen.getByRole("link", { name: "新しく作る" })).toBeDefined()
    expect(document.querySelector(".character-screen-label")).toBeNull()
  })
})
