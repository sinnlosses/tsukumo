import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ScreenNav } from "../../../../../src/browser/components/domain/screen-nav/screen-nav.tsx"
import { useNavDrawer } from "../../../../../src/browser/stores/nav-drawer.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../src/shared/session/session-state.ts"
import { typedElement } from "../../../../typed-element.ts"
import { EMPTY_NAV_DRAWER_SLOTS } from "../../../nav-drawer-slot.tsx"
import { queryClientWrapper } from "../../../query-client.tsx"
import { putSession, type CommandSpy } from "../../../session-store.ts"

// 帯の右端の歯車で開く設定（docs/architecture/screen-design.md「設定の置き場所」「画面のナビゲーション」）。
// いまここにある群は「画面の色」・
// 「新しいセッションの既定」・「書き上げる演出の速さ」の3つ。
// 保存の仕方は `saveAppearanceColorOverride` のままなので、鍵も検証も
// 同じものを見ている。演出の速さの保存は `saveRevealSpeed`（同じ鍵）。

const COLOR_STORAGE_KEY = "tsukumo-appearance-color:v1"
const COLOR_TOKENS = ["--ground", "--surface", "--ink"] as const
const REVEAL_SPEED_STORAGE_KEY = "tsukumo-reveal-speed:v1"

let themeStyleElement: HTMLStyleElement | undefined

beforeEach(() => {
  localStorage.removeItem(COLOR_STORAGE_KEY)
  localStorage.removeItem(REVEAL_SPEED_STORAGE_KEY)
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
  useNavDrawer.setState(useNavDrawer.getInitialState(), true)
  window.location.hash = ""
  localStorage.removeItem(COLOR_STORAGE_KEY)
  localStorage.removeItem(REVEAL_SPEED_STORAGE_KEY)
  for (const token of COLOR_TOKENS) {
    document.documentElement.style.removeProperty(token)
  }
  themeStyleElement?.remove()
  themeStyleElement = undefined
  // 見ているターンは hash の `turn` を正典にする（`useTurnSelection`）ので、次のテストへ持ち越さない。
  window.location.hash = ""
})

function renderScreenNav(state: Partial<SessionState> = {}, spy: CommandSpy = () => {}): void {
  putSession({ ...INITIAL_SESSION_STATE, ...state }, spy)
  render(<ScreenNav drawer={EMPTY_NAV_DRAWER_SLOTS} />, { wrapper: queryClientWrapper() })
}

/** 帯（広い画面）にある歯車。 */
function gear(): HTMLElement {
  return typedElement(
    document.querySelector(".screen-nav > .screen-nav-settings .screen-nav-settings-toggle"),
    HTMLElement,
    "帯の歯車",
  )
}

function panel(): HTMLElement | null {
  return document.querySelector(".screen-nav-settings-panel")
}

/** ポップオーバーの中の色の操作子（ラベルは `<label for>` で結んである）。 */
function colorInput(label: string): HTMLInputElement {
  const labelNode = typedElement(
    [...document.querySelectorAll(".screen-nav-settings-panel label")].find(
      (node) => node.textContent === label,
    ),
    HTMLLabelElement,
    `ラベル「${label}」`,
  )
  return typedElement(
    document.getElementById(labelNode.htmlFor),
    HTMLInputElement,
    `ラベル「${label}」が結ぶ入力欄`,
  )
}

function resetButton(): HTMLButtonElement {
  return typedElement(
    document.querySelector(".screen-nav-settings-reset"),
    HTMLButtonElement,
    "既定に戻すボタン",
  )
}

function readToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
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

  // 閉じ方は「≡」・「いまの作業」と同じ（`useDismissSignal`）。
  it("帯の外側を押すか Esc で閉じる", () => {
    renderScreenNav()

    fireEvent.click(gear())
    fireEvent.pointerDown(document.body)
    expect(panel()).toBeNull()

    fireEvent.click(gear())
    fireEvent.keyDown(document, { key: "Escape" })
    expect(panel()).toBeNull()
  })

  // Esc のときだけ、押した歯車へフォーカスを戻す（「いまの作業」の札と同じ）。
  it("Esc で閉じるとフォーカスが歯車へ戻る", () => {
    renderScreenNav()

    fireEvent.click(gear())
    fireEvent.keyDown(document, { key: "Escape" })

    expect(document.activeElement).toBe(gear())
  })

  it("地・領域・字の色の3つ、新しいセッションの既定の3つ、演出の速さの1つを出す", () => {
    renderScreenNav()
    fireEvent.click(gear())

    expect(
      [...document.querySelectorAll(".screen-nav-settings-panel label")].map(
        (node) => node.textContent,
      ),
    ).toEqual(["画面の地", "領域の地", "字の色", "モデル", "effort", "許可モード", "速さ"])
  })

  it("色を変えると documentElement へすぐ反映し、少し待つと localStorage に残る", async () => {
    renderScreenNav()
    fireEvent.click(gear())

    fireEvent.change(colorInput("画面の地"), { target: { value: "#101010" } })

    expect(readToken("--ground")).toBe("#101010")
    expect(localStorage.getItem(COLOR_STORAGE_KEY)).toBeNull()

    await vi.waitFor(() => {
      expect(JSON.parse(localStorage.getItem(COLOR_STORAGE_KEY) ?? "{}")).toEqual({
        ground: "#101010",
        surface: undefined,
        ink: undefined,
      })
    })
  })

  it("連続して色を変えても、書き込みは最後の値の1回にまとまる", async () => {
    renderScreenNav()
    fireEvent.click(gear())
    const input = colorInput("領域の地")

    fireEvent.change(input, { target: { value: "#111111" } })
    fireEvent.change(input, { target: { value: "#222222" } })
    fireEvent.change(input, { target: { value: "#333333" } })

    await vi.waitFor(() => {
      expect(JSON.parse(localStorage.getItem(COLOR_STORAGE_KEY) ?? "{}")).toEqual({
        ground: undefined,
        surface: "#333333",
        ink: undefined,
      })
    })
  })

  // 色の検証は `changeAppearanceColor` の1箇所のまま（歯車へ移しても変えていない）。
  it("ground を ink と同じ色にしようとすると受け取らず、既定のまま", async () => {
    vi.useFakeTimers()
    try {
      renderScreenNav()
      fireEvent.click(gear())

      // 疑似 :root の --ink は #e8e3ea。同じ値にしようとする。
      fireEvent.change(colorInput("画面の地"), { target: { value: "#e8e3ea" } })

      expect(readToken("--ground")).toBe("#191720")
      await vi.advanceTimersByTimeAsync(250)

      expect(JSON.parse(localStorage.getItem(COLOR_STORAGE_KEY) ?? "{}")).toEqual({
        ground: undefined,
        surface: undefined,
        ink: undefined,
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it("開いただけでは localStorage に書き込まない", async () => {
    vi.useFakeTimers()
    try {
      renderScreenNav()
      fireEvent.click(gear())

      await vi.advanceTimersByTimeAsync(250)

      expect(localStorage.getItem(COLOR_STORAGE_KEY)).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  // 保存済みの上書きを `documentElement` へ差すのは入口（`applyAppearanceColorOverride` の起動時の呼び出し）なので、
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

    expect(resetButton().getAttribute("aria-disabled")).toBe("true")
  })

  it("「既定に戻す」で3色とも上書きが外れ、操作子も既定を指す", async () => {
    renderScreenNav()
    fireEvent.click(gear())

    fireEvent.change(colorInput("画面の地"), { target: { value: "#101010" } })
    expect(resetButton().getAttribute("aria-disabled")).toBe("false")

    fireEvent.click(resetButton())

    expect(readToken("--ground")).toBe("#191720")
    expect(colorInput("画面の地").value).toBe("#191720")

    await vi.waitFor(() => {
      expect(localStorage.getItem(COLOR_STORAGE_KEY)).not.toBeNull()
    })
    expect(JSON.parse(localStorage.getItem(COLOR_STORAGE_KEY) ?? "{}")).toEqual({
      ground: undefined,
      surface: undefined,
      ink: undefined,
    })
  })
})

// 新しいセッションの既定（docs/architecture/screen-design.md「設定の置き場所」）。覚えるのはサーバなので、ここが見るのは
// 「届いた値をそのまま出す」「選ぶと `session.setSessionDefault` を送る」「全部許すは並べない」の3つ。
describe("設定の歯車（新しいセッションの既定）", () => {
  it("届いた既定をそのまま出す", () => {
    renderScreenNav({ sessionDefault: { model: "sonnet", effort: "high", permissionMode: "plan" } })
    fireEvent.click(gear())

    expect(defaultSelect("モデル").value).toBe("sonnet")
    expect(defaultSelect("許可モード").value).toBe("plan")
  })

  it("許可モードの選択肢に「全部許す」は並ばない", () => {
    renderScreenNav()
    fireEvent.click(gear())

    expect([...defaultSelect("許可モード").options].map((option) => option.value)).toEqual([
      "default",
      "acceptEdits",
      "auto",
      "plan",
    ])
  })

  it("モデルを選ぶと、いまの effort・許可モードと一緒に session.setSessionDefault を送る", () => {
    const sent: unknown[] = []
    renderScreenNav(
      { sessionDefault: { model: "opus", effort: "high", permissionMode: "plan" } },
      (command) => sent.push(command),
    )
    fireEvent.click(gear())

    fireEvent.change(defaultSelect("モデル"), { target: { value: "sonnet" } })

    expect(sent).toEqual([
      {
        procedure: "session.setSessionDefault",
        model: "sonnet",
        effort: "high",
        permissionMode: "plan",
      },
    ])
  })

  // 狭い画面では帯の歯車が消え、同じ中身が引き出しの設定の面に出る。
  it("引き出しの設定の面でモデルを選んでも、同じ session.setSessionDefault を送る", () => {
    const sent: unknown[] = []
    renderScreenNav(
      { sessionDefault: { model: "opus", effort: "high", permissionMode: "plan" } },
      (command) => sent.push(command),
    )
    fireEvent.click(screen.getByRole("button", { name: "やり取りとタスクを開く" }))
    const drawer = screen.getByRole("dialog", { name: "引き出し" })
    fireEvent.click(within(drawer).getByRole("button", { name: "設定" }))

    fireEvent.change(within(drawer).getByLabelText("新しいセッションの既定のモデル"), {
      target: { value: "sonnet" },
    })

    expect(sent).toEqual([
      {
        procedure: "session.setSessionDefault",
        model: "sonnet",
        effort: "high",
        permissionMode: "plan",
      },
    ])
  })

  it("許可モードを選ぶと、いまのモデル・effort と一緒に session.setSessionDefault を送る", () => {
    const sent: unknown[] = []
    renderScreenNav(
      { sessionDefault: { model: "haiku", effort: "medium", permissionMode: "auto" } },
      (command) => sent.push(command),
    )
    fireEvent.click(gear())

    fireEvent.change(defaultSelect("許可モード"), { target: { value: "acceptEdits" } })

    expect(sent).toEqual([
      {
        procedure: "session.setSessionDefault",
        model: "haiku",
        effort: "medium",
        permissionMode: "acceptEdits",
      },
    ])
  })
})

// effort の欄（帯の判定 `resolveEffortSelect` をそのまま再利用する。`docs/architecture/screen-design.md`
// 13.6）。帯のドロップダウンと同じ対応表（`modelEffortSupport`）から、既定のモデルの対応を
// 引くので、帯といま出しているモデルが違っても既定のモデルの対応がそのまま出る。
describe("設定の歯車（新しいセッションの既定の effort）", () => {
  const OPUS_SUPPORT = {
    model: "opus",
    supportsEffort: true,
    effortLevels: ["low", "medium", "high", "xhigh", "max"],
  } as const
  const HAIKU_SUPPORT = { model: "haiku", supportsEffort: false, effortLevels: [] } as const

  // haiku は実測で supportsEffort が無いモデル（docs/history/decision.md）。帯といま出している
  // モデルが違っても、既定のモデル（haiku）の対応がそのまま出る。
  it("既定のモデルが対応しないと対応表が言っていれば選べない", () => {
    renderScreenNav({
      model: "claude-opus-5",
      sessionDefault: { model: "haiku", effort: "medium", permissionMode: "auto" },
      modelEffortSupport: [OPUS_SUPPORT, HAIKU_SUPPORT],
    })
    fireEvent.click(gear())

    expect(defaultSelect("effort").disabled).toBe(true)
  })

  it("effort を選ぶと、いまのモデル・許可モードと一緒に session.setSessionDefault を送る", () => {
    const sent: unknown[] = []
    renderScreenNav(
      {
        sessionDefault: { model: "opus", effort: "medium", permissionMode: "plan" },
        modelEffortSupport: [OPUS_SUPPORT],
      },
      (command) => sent.push(command),
    )
    fireEvent.click(gear())

    fireEvent.change(defaultSelect("effort"), { target: { value: "xhigh" } })

    expect(sent).toEqual([
      {
        procedure: "session.setSessionDefault",
        model: "opus",
        effort: "xhigh",
        permissionMode: "plan",
      },
    ])
  })
})

/** ポップオーバーの中の既定の `<select>`（ラベルは `<label for>` で結んである）。 */
function defaultSelect(label: string): HTMLSelectElement {
  const labelNode = typedElement(
    [...document.querySelectorAll(".screen-nav-settings-panel label")].find(
      (node) => node.textContent === label,
    ),
    HTMLLabelElement,
    `ラベル「${label}」`,
  )
  return typedElement(
    document.getElementById(labelNode.htmlFor),
    HTMLSelectElement,
    `ラベル「${label}」が結ぶ <select>`,
  )
}

// 書き上げる演出の速さ（docs/architecture/screen-design.md「設定の置き場所」。`saveRevealSpeed`）。利用者の設定
// なので色と同じ `localStorage`（保存先は違う鍵）。
describe("設定の歯車（書き上げる演出の速さ）", () => {
  it("選ぶとすぐ localStorage に保存される（色と違いデバウンスしない）", () => {
    renderScreenNav()
    fireEvent.click(gear())

    fireEvent.change(defaultSelect("速さ"), { target: { value: "fast" } })

    expect(localStorage.getItem(REVEAL_SPEED_STORAGE_KEY)).toBe("fast")
  })

  // 保存済みの選択を `useState` の初期値として読むだけなので、リロードして開き直した形を作る。
  it("保存済みの選択が、開いたときの操作子の値に出る（リロードしても残る）", () => {
    localStorage.setItem(REVEAL_SPEED_STORAGE_KEY, "fast")

    renderScreenNav()
    fireEvent.click(gear())

    expect(defaultSelect("速さ").value).toBe("fast")
  })
})
