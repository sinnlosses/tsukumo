import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
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

function settingsDialog(): HTMLElement | null {
  return screen.queryByRole("dialog", { name: "設定" })
}

function openedSettingsDialog(): HTMLElement {
  return screen.getByRole("dialog", { name: "設定" })
}

function showFace(name: string): void {
  fireEvent.click(within(openedSettingsDialog()).getByRole("button", { name }))
}

function openFace(name: string): void {
  fireEvent.click(gear())
  if (name !== "見た目") {
    showFace(name)
  }
}

function faceLabels(): (string | null)[] {
  return [...openedSettingsDialog().querySelectorAll("label")].map((node) => node.textContent)
}

/** 面の中の操作子（ラベルは `<label for>` で結んである）。 */
function controlOf<T extends HTMLElement>(
  label: string,
  ctor: new () => T,
  description: string,
): T {
  const labelNode = typedElement(
    [...openedSettingsDialog().querySelectorAll("label")].find(
      (node) => node.textContent === label,
    ),
    HTMLLabelElement,
    `ラベル「${label}」`,
  )
  return typedElement(document.getElementById(labelNode.htmlFor), ctor, description)
}

function colorInput(label: string): HTMLInputElement {
  return controlOf(label, HTMLInputElement, `ラベル「${label}」が結ぶ入力欄`)
}

function resetButton(): HTMLElement {
  return within(openedSettingsDialog()).getByRole("button", { name: "既定に戻す" })
}

function readToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

describe("設定の歯車（帯の右端）", () => {
  it("歯車を押すとダイアログが開き、×で閉じて歯車へフォーカスが戻る", () => {
    renderScreenNav()

    expect(settingsDialog()).toBeNull()

    fireEvent.click(gear())

    expect(settingsDialog()).not.toBeNull()

    fireEvent.click(within(openedSettingsDialog()).getByRole("button", { name: "閉じる（Esc）" }))

    expect(settingsDialog()).toBeNull()
    expect(document.activeElement).toBe(gear())
  })

  it("背景（`<dialog>` 自身）を押すと閉じ、歯車へフォーカスが戻る", () => {
    renderScreenNav()
    fireEvent.click(gear())

    fireEvent.click(openedSettingsDialog())

    expect(settingsDialog()).toBeNull()
    expect(document.activeElement).toBe(gear())
  })

  // Esc で `<dialog>` を閉じるのはブラウザなので、閉じたあとに届く `close` から先を見る。
  it("`<dialog>` が閉じると（Esc）歯車へフォーカスが戻る", () => {
    renderScreenNav()
    fireEvent.click(gear())
    const dialog = openedSettingsDialog()

    act(() => {
      if (dialog instanceof window.HTMLDialogElement) {
        dialog.close()
      }
    })

    expect(settingsDialog()).toBeNull()
    expect(document.activeElement).toBe(gear())
  })

  it("初めは「見た目」の面で、地・領域・字の色の3つを出す", () => {
    renderScreenNav()
    fireEvent.click(gear())

    expect(faceLabels()).toEqual(["地の色", "領域の色", "字の色"])
  })

  it("ナビは3項目で、選んだ項目が aria-current になり面が替わる。「すぐ効く」の印は無い", () => {
    renderScreenNav()
    fireEvent.click(gear())
    const dialog = openedSettingsDialog()
    const names = ["見た目", "セッションの既定", "演出"]

    const current = (): (string | null)[] =>
      names.map((name) => within(dialog).getByRole("button", { name }).getAttribute("aria-current"))

    expect(current()).toEqual(["page", null, null])

    showFace("セッションの既定")

    expect(current()).toEqual([null, "page", null])
    expect(faceLabels()).toEqual(["モデル", "effort", "許可モード"])

    showFace("演出")

    expect(faceLabels()).toEqual(["書き上げる速さ"])
    expect(dialog.textContent).not.toContain("すぐ効")
  })

  it("開き直すと「見た目」から始まる", () => {
    renderScreenNav()
    fireEvent.click(gear())
    showFace("演出")
    fireEvent.click(within(openedSettingsDialog()).getByRole("button", { name: "閉じる（Esc）" }))

    fireEvent.click(gear())

    expect(faceLabels()).toEqual(["地の色", "領域の色", "字の色"])
  })

  it("見た目の面の見本の帯が、選んだ色を映す", () => {
    renderScreenNav()
    fireEvent.click(gear())

    fireEvent.change(colorInput("地の色"), { target: { value: "#101010" } })

    const band = typedElement(
      openedSettingsDialog().querySelector('[class*="band"]'),
      HTMLElement,
      "見本の帯",
    )
    expect(band.style.backgroundColor).toBe("#101010")
  })

  it("色を変えると documentElement へすぐ反映し、少し待つと localStorage に残る", async () => {
    renderScreenNav()
    fireEvent.click(gear())

    fireEvent.change(colorInput("地の色"), { target: { value: "#101010" } })

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
    const input = colorInput("領域の色")

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
      fireEvent.change(colorInput("地の色"), { target: { value: "#e8e3ea" } })

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

    expect(colorInput("地の色").value).toBe("#0a0a0a")
  })

  it("上書きが無ければ「既定に戻す」は押せない", () => {
    renderScreenNav()
    fireEvent.click(gear())

    expect(resetButton().getAttribute("aria-disabled")).toBe("true")
  })

  it("「既定に戻す」で3色とも上書きが外れ、操作子も既定を指す", async () => {
    renderScreenNav()
    fireEvent.click(gear())

    fireEvent.change(colorInput("地の色"), { target: { value: "#101010" } })
    expect(resetButton().getAttribute("aria-disabled")).toBe("false")

    fireEvent.click(resetButton())

    expect(readToken("--ground")).toBe("#191720")
    expect(colorInput("地の色").value).toBe("#191720")

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
    openFace("セッションの既定")

    expect(defaultSelect("モデル").value).toBe("sonnet")
    expect(defaultSelect("許可モード").value).toBe("plan")
  })

  it("許可モードの選択肢に「全部許す」は並ばない", () => {
    renderScreenNav()
    openFace("セッションの既定")

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
    openFace("セッションの既定")

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
    openFace("セッションの既定")

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
    openFace("セッションの既定")

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
    openFace("セッションの既定")

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

/** 開いている面の `<select>`（ラベルは `<label for>` で結んである）。 */
function defaultSelect(label: string): HTMLSelectElement {
  return controlOf(label, HTMLSelectElement, `ラベル「${label}」が結ぶ <select>`)
}

// 書き上げる演出の速さ（docs/architecture/screen-design.md「設定の置き場所」。`saveRevealSpeed`）。利用者の設定
// なので色と同じ `localStorage`（保存先は違う鍵）。
describe("設定の歯車（書き上げる演出の速さ）", () => {
  it("選ぶとすぐ localStorage に保存される（色と違いデバウンスしない）", () => {
    renderScreenNav()
    openFace("演出")

    fireEvent.change(defaultSelect("書き上げる速さ"), { target: { value: "fast" } })

    expect(localStorage.getItem(REVEAL_SPEED_STORAGE_KEY)).toBe("fast")
  })

  // 保存済みの選択を `useState` の初期値として読むだけなので、リロードして開き直した形を作る。
  it("保存済みの選択が、開いたときの操作子の値に出る（リロードしても残る）", () => {
    localStorage.setItem(REVEAL_SPEED_STORAGE_KEY, "fast")

    renderScreenNav()
    openFace("演出")

    expect(defaultSelect("書き上げる速さ").value).toBe("fast")
  })
})
