import { afterEach, beforeEach, describe, expect, it } from "bun:test"

import { cleanup, fireEvent, render } from "@testing-library/react"

import { ScreenNav } from "../../../../src/browser/features/screen-nav/screen-nav.tsx"
import { SessionStoreContext } from "../../../../src/browser/stores/session.tsx"
import { INITIAL_SESSION_STATE, type SessionState } from "../../../../src/shared/session-state.ts"
import { sessionStoreWith } from "../../session-store.ts"

// 帯の右端の歯車で開く設定（docs/design.md 13.6 / 13.9）。いまここにある群は「画面の色」の1つ。
// **保存の仕方は `browser/lib/appearance-color.ts` のまま**なので、鍵も検証も
// `appearance-color.test.ts` と同じものを見ている。

const COLOR_STORAGE_KEY = "tsukumo-appearance-color:v1"
const COLOR_TOKENS = ["--ground", "--surface", "--ink"] as const

let themeStyleElement: HTMLStyleElement | undefined

beforeEach(() => {
  localStorage.removeItem(COLOR_STORAGE_KEY)
  for (const token of COLOR_TOKENS) {
    document.documentElement.style.removeProperty(token)
  }
  // `:root` の既定（JS 側に16進を持たないので、読む先を疑似的に用意する）。
  themeStyleElement = document.createElement("style")
  themeStyleElement.textContent =
    ":root { --ground: #191720; --surface: #221f2b; --ink: #e8e3ea; --accent: #f2b0a0; }"
  document.head.appendChild(themeStyleElement)
})

afterEach(() => {
  cleanup()
  localStorage.removeItem(COLOR_STORAGE_KEY)
  for (const token of COLOR_TOKENS) {
    document.documentElement.style.removeProperty(token)
  }
  themeStyleElement?.remove()
  themeStyleElement = undefined
})

function renderScreenNav(state: Partial<SessionState> = {}): void {
  const store = sessionStoreWith({ ...INITIAL_SESSION_STATE, ...state })
  render(
    <SessionStoreContext.Provider value={store}>
      <ScreenNav />
    </SessionStoreContext.Provider>,
  )
}

/** 帯（広い画面）にある歯車。狭い画面の「≡」の面の中のものは数えない。 */
function gear(): HTMLElement {
  return document.querySelector(
    ".screen-nav > .screen-nav-settings .screen-nav-settings-toggle",
  ) as HTMLElement
}

function panel(): HTMLElement | null {
  return document.querySelector(".screen-nav-settings-panel")
}

/** ポップオーバーの中の色の操作子（ラベルは `<label for>` で結んである）。 */
function colorInput(label: string): HTMLInputElement {
  const labelNode = [...document.querySelectorAll(".screen-nav-settings-panel label")].find(
    (node) => node.textContent === label,
  ) as HTMLLabelElement
  return document.getElementById(labelNode.htmlFor) as HTMLInputElement
}

function resetButton(): HTMLButtonElement {
  return document.querySelector(".screen-nav-settings-reset") as HTMLButtonElement
}

function readToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

// 画面の色の書き込みは200ms（`APPEARANCE_COLOR_DEBOUNCE_MS`）まとめるので、それより長く待つ。
function waitForDebounce(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 250))
}

describe("設定の歯車（帯の右端）", () => {
  it("歯車を押すとポップオーバーが開き、もう一度押すと閉じる", () => {
    renderScreenNav()

    expect(panel()).toBeNull()
    expect(gear().getAttribute("aria-expanded")).toBe("false")

    fireEvent.click(gear())

    expect(panel()).not.toBeNull()
    expect(gear().getAttribute("aria-expanded")).toBe("true")

    fireEvent.click(gear())

    expect(panel()).toBeNull()
  })

  // 閉じ方は「≡」・「いまの作業」と同じ（`browser/hooks/use-dismiss-signal.ts`）。
  it("帯の外側を押すか Esc で閉じる", () => {
    renderScreenNav()

    fireEvent.click(gear())
    fireEvent.pointerDown(document.body)
    expect(panel()).toBeNull()

    fireEvent.click(gear())
    fireEvent.keyDown(document, { key: "Escape" })
    expect(panel()).toBeNull()
  })

  it("地・領域・字の色の3つを出す", () => {
    renderScreenNav()
    fireEvent.click(gear())

    expect(
      [...document.querySelectorAll(".screen-nav-settings-panel label")].map(
        (node) => node.textContent,
      ),
    ).toEqual(["画面の地", "領域の地", "字の色"])
  })

  it("色を変えると documentElement へすぐ反映し、少し待つと localStorage に残る", async () => {
    renderScreenNav()
    fireEvent.click(gear())

    fireEvent.change(colorInput("画面の地"), { target: { value: "#101010" } })

    expect(readToken("--ground")).toBe("#101010")
    expect(localStorage.getItem(COLOR_STORAGE_KEY)).toBeNull()

    await waitForDebounce()

    expect(JSON.parse(localStorage.getItem(COLOR_STORAGE_KEY) ?? "{}")).toEqual({
      ground: "#101010",
      surface: undefined,
      ink: undefined,
    })
  })

  it("連続して色を変えても、書き込みは最後の値の1回にまとまる", async () => {
    renderScreenNav()
    fireEvent.click(gear())
    const input = colorInput("領域の地")

    fireEvent.change(input, { target: { value: "#111111" } })
    fireEvent.change(input, { target: { value: "#222222" } })
    fireEvent.change(input, { target: { value: "#333333" } })
    await waitForDebounce()

    expect(JSON.parse(localStorage.getItem(COLOR_STORAGE_KEY) ?? "{}")).toEqual({
      ground: undefined,
      surface: "#333333",
      ink: undefined,
    })
  })

  // 色の検証は `browser/lib/appearance-color.ts` の1箇所のまま（歯車へ移しても変えていない）。
  it("ground を ink と同じ色にしようとすると受け取らず、既定のまま", async () => {
    renderScreenNav()
    fireEvent.click(gear())

    // 疑似 :root の --ink は #e8e3ea。同じ値にしようとする。
    fireEvent.change(colorInput("画面の地"), { target: { value: "#e8e3ea" } })

    expect(readToken("--ground")).toBe("#191720")
    await waitForDebounce()

    expect(JSON.parse(localStorage.getItem(COLOR_STORAGE_KEY) ?? "{}")).toEqual({
      ground: undefined,
      surface: undefined,
      ink: undefined,
    })
  })

  it("開いただけでは localStorage に書き込まない", async () => {
    renderScreenNav()
    fireEvent.click(gear())

    await waitForDebounce()

    expect(localStorage.getItem(COLOR_STORAGE_KEY)).toBeNull()
  })

  // 保存済みの上書きを `documentElement` へ差すのは入口（`src/browser/main.tsx`）なので、
  // ここではその後の状態（= リロードして戻ってきた形）を作ってから開く。
  it("保存済みの上書きが、開いたときの操作子の値に出る", () => {
    localStorage.setItem(COLOR_STORAGE_KEY, JSON.stringify({ ground: "#0a0a0a" }))
    document.documentElement.style.setProperty("--ground", "#0a0a0a")

    renderScreenNav()
    fireEvent.click(gear())

    expect(colorInput("画面の地").value).toBe("#0a0a0a")
  })

  it("上書きが無ければ「既定に戻す」は押せない", () => {
    renderScreenNav()
    fireEvent.click(gear())

    expect(resetButton().disabled).toBe(true)
  })

  it("「既定に戻す」で3色とも上書きが外れ、操作子も既定を指す", async () => {
    renderScreenNav()
    fireEvent.click(gear())

    fireEvent.change(colorInput("画面の地"), { target: { value: "#101010" } })
    expect(resetButton().disabled).toBe(false)

    fireEvent.click(resetButton())

    expect(readToken("--ground")).toBe("#191720")
    expect(colorInput("画面の地").value).toBe("#191720")
    await waitForDebounce()

    expect(JSON.parse(localStorage.getItem(COLOR_STORAGE_KEY) ?? "{}")).toEqual({
      ground: undefined,
      surface: undefined,
      ink: undefined,
    })
  })

  // 狭い画面では帯の要素がすべて「≡」の面に畳まれる（13.9「狭い画面」）。歯車も同じ畳み方。
  it("狭い画面の「≡」の面の中にも同じ歯車が入る", () => {
    renderScreenNav()

    fireEvent.click(document.querySelector(".screen-nav-toggle") as HTMLElement)

    expect(document.querySelector(".screen-nav-panel .screen-nav-settings-toggle")).not.toBeNull()
  })
})
