import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ScreenNav } from "../../../../../src/browser/components/frame/screen-nav/screen-nav.tsx"
import {
  SETTING_ENTRIES,
  SETTING_FACE_LABEL,
} from "../../../../../src/browser/domain/setting-entry.ts"
import { useNavDrawer } from "../../../../../src/browser/stores/nav-drawer.ts"
import { useSettingsRequest } from "../../../../../src/browser/stores/settings-request.ts"
import {
  BUILTIN_GEAR_PREFERENCES,
  hexColorSchema,
} from "../../../../../src/shared/session/gear-preference.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../src/shared/session/session-state.ts"
import { typedElement } from "../../../../typed-element.ts"
import { EMPTY_NAV_DRAWER_SLOTS } from "../../../nav-drawer-slot.tsx"
import { stubPhoneWidth } from "../../../phone-width.ts"
import { queryClientWrapper } from "../../../query-client.tsx"
import { putSession, type CommandSpy, type SentCommand } from "../../../session-store.ts"

// 帯の右端の歯車で開く設定（docs/architecture/screen-design.md「設定の置き場所」「画面のナビゲーション」）。
// いまここにある群は「画面の色」・
// 「新しいセッションの既定」・「書き上げる演出の速さ」の3つ。
// 色と演出の速さを覚えるのはサーバ（手続き `session.setGearPreference`）。

const COLOR_TOKENS = ["--ground", "--surface", "--ink"] as const

let themeStyleElement: HTMLStyleElement | undefined

/** 送った手続きのうち、色を覚えさせたものの値。 */
function sentColors(sent: readonly SentCommand[]): readonly unknown[] {
  return sent
    .filter(
      (command) =>
        command.procedure === "session.setGearPreference" && command["field"] === "appearanceColor",
    )
    .map((command) => command["value"])
}

beforeEach(() => {
  stubPhoneWidth(true)
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
  vi.restoreAllMocks()
  useSettingsRequest.setState(useSettingsRequest.getInitialState(), true)
  useNavDrawer.setState(useNavDrawer.getInitialState(), true)
  window.location.hash = ""
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
  return [...openedSettingsDialog().querySelectorAll("section label")].map(
    (node) => node.textContent,
  )
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

function readToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

describe("設定の歯車（帯の右端）", () => {
  it("歯車を押すとダイアログが開き、×で閉じて歯車へフォーカスが戻る", () => {
    renderScreenNav()

    expect(settingsDialog()).toBeNull()

    gear().focus()
    fireEvent.click(gear())

    expect(settingsDialog()).not.toBeNull()

    fireEvent.click(within(openedSettingsDialog()).getByRole("button", { name: "閉じる（Esc）" }))

    expect(settingsDialog()).toBeNull()
    expect(document.activeElement).toBe(gear())
  })

  it("Esc で閉じて歯車へフォーカスが戻る", () => {
    renderScreenNav()
    gear().focus()
    fireEvent.click(gear())

    fireEvent.keyDown(document, { key: "Escape" })

    expect(settingsDialog()).toBeNull()
    expect(document.activeElement).toBe(gear())
  })

  it("初めは「見た目」の面で、地・領域・字の色の3つを出す", () => {
    renderScreenNav()
    fireEvent.click(gear())

    expect(faceLabels()).toEqual([
      "地の色",
      "領域の色",
      "字の色",
      "背景の暗さ",
      "パネルのぼかし",
      "パネルの濃さ",
    ])
  })

  it("ナビは5項目で、選んだ項目が aria-current になり面が替わる", () => {
    renderScreenNav()
    fireEvent.click(gear())
    const dialog = openedSettingsDialog()
    const names = ["見た目", "新しいセッション", "演出", "タスクの実行", "ワークフロー"]

    const current = (): (string | null)[] =>
      names.map((name) => within(dialog).getByRole("button", { name }).getAttribute("aria-current"))

    expect(current()).toEqual(["page", null, null, null, null])

    showFace("新しいセッション")

    expect(current()).toEqual([null, "page", null, null, null])
    expect(faceLabels().slice(0, 4)).toEqual([
      "モデル",
      "effort（考える深さ）",
      "許可モード",
      "図の既定",
    ])

    showFace("演出")

    expect(faceLabels()).toEqual(["書き上げる速さ", "動き", "待ちの一言", "進み具合の催促"])
  })

  it("パレットに出す設定の行の宣言が、各ページの行の名前と食い違わない", () => {
    renderScreenNav()
    fireEvent.click(gear())

    for (const [faceKey, faceLabel] of Object.entries(SETTING_FACE_LABEL)) {
      showFace(faceLabel)
      const declared = SETTING_ENTRIES.filter((entry) => entry.faceKey === faceKey).map(
        (entry) => entry.label,
      )
      expect(faceLabels(), faceLabel).toEqual(declared)
    }
  })

  it("宣言の説明が、各行の名前の下に1つずつ出る", () => {
    renderScreenNav()
    fireEvent.click(gear())

    for (const [faceKey, faceLabel] of Object.entries(SETTING_FACE_LABEL)) {
      showFace(faceLabel)
      for (const entry of SETTING_ENTRIES.filter((candidate) => candidate.faceKey === faceKey)) {
        const found = within(openedSettingsDialog()).getAllByText(entry.description)
        expect(found, entry.label).toHaveLength(1)
        expect(found[0]?.previousElementSibling?.textContent, entry.label).toBe(entry.label)
      }
    }
  })

  it("閉じて開き直すと、最後に見たページで開く", () => {
    renderScreenNav()
    fireEvent.click(gear())
    showFace("演出")
    fireEvent.click(within(openedSettingsDialog()).getByRole("button", { name: "閉じる（Esc）" }))

    fireEvent.click(gear())

    expect(faceLabels()).toEqual(["書き上げる速さ", "動き", "待ちの一言", "進み具合の催促"])
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

  it("色を変えると documentElement へすぐ反映し、少し待つと覚えさせる", async () => {
    const sent: SentCommand[] = []
    renderScreenNav({}, (command) => {
      sent.push(command)
    })
    fireEvent.click(gear())

    fireEvent.change(colorInput("地の色"), { target: { value: "#101010" } })

    expect(readToken("--ground")).toBe("#101010")
    expect(sentColors(sent)).toEqual([])

    await vi.waitFor(() => {
      expect(sentColors(sent)).toEqual([{ ground: "#101010" }])
    })
  })

  it("連続して色を変えても、送るのは最後の値の1回にまとまる", async () => {
    const sent: SentCommand[] = []
    renderScreenNav({}, (command) => {
      sent.push(command)
    })
    fireEvent.click(gear())
    const input = colorInput("領域の色")

    fireEvent.change(input, { target: { value: "#111111" } })
    fireEvent.change(input, { target: { value: "#222222" } })
    fireEvent.change(input, { target: { value: "#333333" } })

    await vi.waitFor(() => {
      expect(sentColors(sent)).toEqual([{ surface: "#333333" }])
    })
  })

  // 色の検証は `changeAppearanceColor` の1箇所のまま（歯車へ移しても変えていない）。
  it("ground を ink と同じ色にしようとすると受け取らず、既定のまま", async () => {
    vi.useFakeTimers()
    try {
      const sent: SentCommand[] = []
      renderScreenNav({}, (command) => {
        sent.push(command)
      })
      fireEvent.click(gear())

      // 疑似 :root の --ink は #e8e3ea。同じ値にしようとする。
      fireEvent.change(colorInput("地の色"), { target: { value: "#e8e3ea" } })

      expect(readToken("--ground")).toBe("#191720")
      await vi.advanceTimersByTimeAsync(250)

      expect(sentColors(sent)).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })

  it("開いただけでは覚えさせない", async () => {
    vi.useFakeTimers()
    try {
      const sent: SentCommand[] = []
      renderScreenNav({}, (command) => {
        sent.push(command)
      })
      fireEvent.click(gear())

      await vi.advanceTimersByTimeAsync(250)

      expect(sentColors(sent)).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })

  // 覚えた上書きを `documentElement` へ差すのは入口（`applyGearPreferences` の起動時の呼び出し）なので、
  // ここではその後の状態（= リロードして戻ってきた形）を作ってから開く。
  it("覚えた上書きが、開いたときの操作子の値に出る", () => {
    document.documentElement.style.setProperty("--ground", "#0a0a0a")

    renderScreenNav({
      gearPreferences: {
        ...BUILTIN_GEAR_PREFERENCES,
        appearanceColor: { ground: hexColorSchema.parse("#0a0a0a") },
      },
    })
    fireEvent.click(gear())

    expect(colorInput("地の色").value).toBe("#0a0a0a")
  })
})

// 新しいセッションの既定（docs/architecture/screen-design.md「設定の置き場所」）。覚えるのはサーバなので、ここが見るのは
// 「届いた値をそのまま出す」「選ぶと `session.setSessionDefault` を送る」「全部許すは並べない」の3つ。
describe("設定の歯車（新しいセッションの既定）", () => {
  it("届いた既定をそのまま出す", () => {
    renderScreenNav({
      sessionDefault: {
        model: "sonnet",
        effort: "high",
        permissionMode: "plan",
        figurePreference: "chart",
      },
    })
    openFace("新しいセッション")

    expect(defaultSelect("モデル").value).toBe("sonnet")
    expect(defaultSelect("許可モード").value).toBe("plan")
  })

  it("許可モードの選択肢に「全部許す」は並ばない", () => {
    renderScreenNav()
    openFace("新しいセッション")

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
    openFace("新しいセッション")

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

  it("引き出しの設定の面は、引き出しに出す4つの面の見出しをこの順に並べ、見た目の面は見本の帯つきで、ワークフローは出さない", () => {
    renderScreenNav()
    fireEvent.click(screen.getByRole("button", { name: "やり取りとタスクを開く" }))
    const drawer = screen.getByRole("dialog", { name: "引き出し" })
    fireEvent.click(within(drawer).getByRole("button", { name: "設定" }))

    expect(
      within(drawer)
        .getAllByText(/^(見た目|新しいセッション|演出|タスクの実行|ワークフロー)$/u)
        .map((heading) => heading.textContent),
    ).toEqual(["見た目", "新しいセッション", "演出", "タスクの実行"])
    expect(within(drawer).getByText("領域の中の字")).toBeDefined()
  })

  // 狭い画面では帯の歯車が消え、同じ中身が引き出しの設定の面に出る。
  it("引き出しの設定の面でモデルを選んでも、同じ session.setSessionDefault を送る", () => {
    const sent: unknown[] = []
    renderScreenNav(
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
        figurePreference: "chart",
      },
    ])
  })

  it("許可モードを選ぶと、いまのモデル・effort と一緒に session.setSessionDefault を送る", () => {
    const sent: unknown[] = []
    renderScreenNav(
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
    openFace("新しいセッション")

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

// effort の欄（帯の判定 `resolveEffortSelect` をそのまま再利用する。`docs/architecture/screen-design.md`
// 13.6）。帯のドロップダウンと同じ対応表（`modelEffortSupport`）から、既定のモデルの対応を
// 引くので、帯といま出しているモデルが違っても既定のモデルの対応がそのまま出る。
describe("設定の歯車（新しいセッションの既定の effort）", () => {
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

  // haiku は実測で supportsEffort が無いモデル（docs/history/decision.md）。帯といま出している
  // モデルが違っても、既定のモデル（haiku）の対応がそのまま出る。
  it("既定のモデルが対応しないと対応表が言っていれば選べない", () => {
    renderScreenNav({
      model: "claude-opus-5",
      sessionDefault: {
        model: "haiku",
        effort: "medium",
        permissionMode: "auto",
        figurePreference: "chart",
      },
      modelEffortSupport: [OPUS_SUPPORT, HAIKU_SUPPORT],
    })
    openFace("新しいセッション")

    expect(defaultSelect("effort（考える深さ）").disabled).toBe(true)
  })

  it("effort を選ぶと、いまのモデル・許可モードと一緒に session.setSessionDefault を送る", () => {
    const sent: unknown[] = []
    renderScreenNav(
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
    openFace("新しいセッション")

    fireEvent.change(defaultSelect("effort（考える深さ）"), { target: { value: "xhigh" } })

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

/** 開いている面の `<select>`（ラベルは `<label for>` で結んである）。 */
function defaultSelect(label: string): HTMLSelectElement {
  return controlOf(label, HTMLSelectElement, `ラベル「${label}」が結ぶ <select>`)
}

// 書き上げる演出の速さ（docs/architecture/screen-design.md「設定の置き場所」）。覚えるのはサーバで、表示は届いた値に従う。
describe("設定の歯車（書き上げる演出の速さ）", () => {
  it("選ぶとすぐ session.setGearPreference を送る（色と違いまとめない）", () => {
    const sent: SentCommand[] = []
    renderScreenNav({}, (command) => {
      sent.push(command)
    })
    openFace("演出")

    fireEvent.change(defaultSelect("書き上げる速さ"), { target: { value: "fast" } })

    expect(sent).toEqual([
      { procedure: "session.setGearPreference", field: "revealSpeed", value: "fast" },
    ])
  })

  it("届いた選択が、開いたときの操作子の値に出る", () => {
    renderScreenNav({ gearPreferences: { ...BUILTIN_GEAR_PREFERENCES, revealSpeed: "fast" } })
    openFace("演出")

    expect(defaultSelect("書き上げる速さ").value).toBe("fast")
  })
})
