import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SettingsScreen } from "../../../../../src/browser/components/frame/screen-nav/settings-screen.tsx"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../src/shared/session/session-state.ts"
import { typedElement } from "../../../../typed-element.ts"
import { queryClientWrapper } from "../../../query-client.tsx"
import { stubRpcFetch, type RpcFetchStub } from "../../../rpc-fetch-stub.ts"
import { putSession, type CommandSpy } from "../../../session-store.ts"

// 設定の紙（`#settings`）の、画面の色・新しいセッションの既定・書き上げる演出の速さ。
// 色の保存は `saveAppearanceColorOverride`、演出の速さの保存は `saveRevealSpeed` の鍵を見る。

const COLOR_STORAGE_KEY = "tsukumo-appearance-color:v1"
const COLOR_TOKENS = ["--ground", "--surface", "--ink"] as const
const REVEAL_SPEED_STORAGE_KEY = "tsukumo-reveal-speed:v1"

let themeStyleElement: HTMLStyleElement | undefined
let rpcStub: RpcFetchStub | undefined

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
  // ワークフローの面と起動するスキルの候補が読む手続きは、届かないままにしておく。
  rpcStub = stubRpcFetch(() => ({ kind: "pending" }))
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  rpcStub?.restore()
  rpcStub = undefined
  localStorage.removeItem(COLOR_STORAGE_KEY)
  localStorage.removeItem(REVEAL_SPEED_STORAGE_KEY)
  for (const token of COLOR_TOKENS) {
    document.documentElement.style.removeProperty(token)
  }
  themeStyleElement?.remove()
  themeStyleElement = undefined
})

function renderSettings(state: Partial<SessionState> = {}, spy: CommandSpy = () => {}): void {
  putSession({ ...INITIAL_SESSION_STATE, ...state }, spy)
  render(<SettingsScreen />, { wrapper: queryClientWrapper() })
}

function group(name: string): HTMLElement {
  return screen.getByRole("region", { name })
}

function groupLabels(name: string): (string | null)[] {
  return [...group(name).querySelectorAll("label")].map((node) => node.textContent)
}

/** 紙の中の操作子（ラベルは `<label for>` で結んである）。 */
function controlOf<T extends HTMLElement>(
  label: string,
  ctor: new () => T,
  description: string,
): T {
  const labelNode = typedElement(
    [...document.querySelectorAll("label")].find((node) => node.textContent === label),
    HTMLLabelElement,
    `ラベル「${label}」`,
  )
  return typedElement(document.getElementById(labelNode.htmlFor), ctor, description)
}

function colorInput(label: string): HTMLInputElement {
  return controlOf(label, HTMLInputElement, `ラベル「${label}」が結ぶ入力欄`)
}

function resetButton(): HTMLElement {
  return screen.getByRole("button", { name: "既定に戻す" })
}

function readToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

describe("設定の紙（画面の色）", () => {
  it("群ごとに、面の項目をこの順に出す", () => {
    renderSettings()

    expect(groupLabels("見た目")).toEqual([
      "1字のキー（d・o・?）",
      "地の色",
      "領域の色",
      "字の色",
      "書き上げる速さ",
    ])
    expect(groupLabels("動き方")).toEqual(["モデル", "effort", "許可モード", "図の既定"])
  })

  it("見た目の面の見本の帯が、選んだ色を映す", () => {
    renderSettings()

    fireEvent.change(colorInput("地の色"), { target: { value: "#101010" } })

    const band = typedElement(
      group("見た目").querySelector('[class*="band"]'),
      HTMLElement,
      "見本の帯",
    )
    expect(band.style.backgroundColor).toBe("#101010")
  })

  it("色を変えると documentElement へすぐ反映し、少し待つと localStorage に残る", async () => {
    renderSettings()

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
    renderSettings()
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

  // 色の検証は `changeAppearanceColor` の1箇所にある。
  it("ground を ink と同じ色にしようとすると受け取らず、既定のまま", async () => {
    vi.useFakeTimers()
    try {
      renderSettings()

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
      renderSettings()

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

    renderSettings()

    expect(colorInput("地の色").value).toBe("#0a0a0a")
  })

  it("上書きが無ければ「既定に戻す」は押せない", () => {
    renderSettings()

    expect(resetButton().getAttribute("aria-disabled")).toBe("true")
  })

  it("「既定に戻す」で3色とも上書きが外れ、操作子も既定を指す", async () => {
    renderSettings()

    fireEvent.change(colorInput("地の色"), { target: { value: "#101010" } })
    expect(resetButton().getAttribute("aria-disabled")).toBeNull()

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
describe("設定の紙（新しいセッションの既定）", () => {
  it("届いた既定をそのまま出す", () => {
    renderSettings({
      sessionDefault: {
        model: "sonnet",
        effort: "high",
        permissionMode: "plan",
        figurePreference: "chart",
      },
    })

    expect(defaultSelect("モデル").value).toBe("sonnet")
    expect(defaultSelect("許可モード").value).toBe("plan")
  })

  it("許可モードの選択肢に「全部許す」は並ばない", () => {
    renderSettings()

    expect([...defaultSelect("許可モード").options].map((option) => option.value)).toEqual([
      "default",
      "acceptEdits",
      "auto",
      "plan",
    ])
  })

  it("モデルを選ぶと、いまの effort・許可モードと一緒に session.setSessionDefault を送る", () => {
    const sent: unknown[] = []
    renderSettings(
      {
        sessionDefault: {
          model: "opus",
          effort: "high",
          permissionMode: "plan",
          figurePreference: "chart",
        },
      },
      (command) => sent.push(command),
    )

    fireEvent.change(defaultSelect("モデル"), { target: { value: "sonnet" } })

    expect(sent).toEqual([
      {
        procedure: "session.setSessionDefault",
        model: "sonnet",
        effort: "high",
        permissionMode: "plan",
        figurePreference: "chart",
      },
    ])
  })

  it("許可モードを選ぶと、いまのモデル・effort と一緒に session.setSessionDefault を送る", () => {
    const sent: unknown[] = []
    renderSettings(
      {
        sessionDefault: {
          model: "haiku",
          effort: "medium",
          permissionMode: "auto",
          figurePreference: "chart",
        },
      },
      (command) => sent.push(command),
    )

    fireEvent.change(defaultSelect("許可モード"), { target: { value: "acceptEdits" } })

    expect(sent).toEqual([
      {
        procedure: "session.setSessionDefault",
        model: "haiku",
        effort: "medium",
        permissionMode: "acceptEdits",
        figurePreference: "chart",
      },
    ])
  })
})

// effort の欄（判定は `resolveEffortSelect` をそのまま再利用する。`docs/architecture/screen-design.md`
// 13.6）。対応表（`modelEffortSupport`）から既定のモデルの対応を引くので、
// いま出しているモデルが違っても既定のモデルの対応がそのまま出る。
describe("設定の紙（新しいセッションの既定の effort）", () => {
  const OPUS_SUPPORT = {
    model: "opus",
    resolvedModel: "claude-opus-5",
    supportsEffort: true,
    effortLevels: ["low", "medium", "high", "xhigh", "max"],
  } as const
  const HAIKU_SUPPORT = {
    model: "haiku",
    resolvedModel: "claude-haiku-4-5-20251001",
    supportsEffort: false,
    effortLevels: [],
  } as const

  // haiku は実測で supportsEffort が無いモデル（docs/history/decision.md）。いま出している
  // モデルが違っても、既定のモデル（haiku）の対応がそのまま出る。
  it("既定のモデルが対応しないと対応表が言っていれば選べない", () => {
    renderSettings({
      model: "claude-opus-5",
      sessionDefault: {
        model: "haiku",
        effort: "medium",
        permissionMode: "auto",
        figurePreference: "chart",
      },
      modelEffortSupport: [OPUS_SUPPORT, HAIKU_SUPPORT],
    })

    expect(defaultSelect("effort").disabled).toBe(true)
  })

  it("effort を選ぶと、いまのモデル・許可モードと一緒に session.setSessionDefault を送る", () => {
    const sent: unknown[] = []
    renderSettings(
      {
        sessionDefault: {
          model: "opus",
          effort: "medium",
          permissionMode: "plan",
          figurePreference: "chart",
        },
        modelEffortSupport: [OPUS_SUPPORT],
      },
      (command) => sent.push(command),
    )

    fireEvent.change(defaultSelect("effort"), { target: { value: "xhigh" } })

    expect(sent).toEqual([
      {
        procedure: "session.setSessionDefault",
        model: "opus",
        effort: "xhigh",
        permissionMode: "plan",
        figurePreference: "chart",
      },
    ])
  })
})

/** 紙の `<select>`（ラベルは `<label for>` で結んである）。 */
function defaultSelect(label: string): HTMLSelectElement {
  return controlOf(label, HTMLSelectElement, `ラベル「${label}」が結ぶ <select>`)
}

// 書き上げる演出の速さ（docs/architecture/screen-design.md「設定の置き場所」。`saveRevealSpeed`）。利用者の設定
// なので色と同じ `localStorage`（保存先は違う鍵）。
describe("設定の紙（書き上げる演出の速さ）", () => {
  it("選ぶとすぐ localStorage に保存される（色と違いデバウンスしない）", () => {
    renderSettings()

    fireEvent.change(defaultSelect("書き上げる速さ"), { target: { value: "fast" } })

    expect(localStorage.getItem(REVEAL_SPEED_STORAGE_KEY)).toBe("fast")
  })

  // 保存済みの選択を `useState` の初期値として読むだけなので、リロードして開き直した形を作る。
  it("保存済みの選択が、開いたときの操作子の値に出る（リロードしても残る）", () => {
    localStorage.setItem(REVEAL_SPEED_STORAGE_KEY, "fast")

    renderSettings()

    expect(defaultSelect("書き上げる速さ").value).toBe("fast")
  })
})
