import { afterEach, beforeEach, describe, expect, it } from "bun:test"

import { cleanup, fireEvent, render } from "@testing-library/react"

import { ScreenNav } from "../../../../src/browser/features/screen-nav/screen-nav.tsx"
import { QuestionScrollProvider } from "../../../../src/browser/stores/question-scroll.tsx"
import { SessionStoreContext } from "../../../../src/browser/stores/session.tsx"
import { TurnSelectionProvider } from "../../../../src/browser/stores/turn-selection.tsx"
import { INITIAL_SESSION_STATE, type SessionState } from "../../../../src/shared/session-state.ts"
import { sessionStoreWith, type CommandSpy } from "../../session-store.ts"

// 帯の右端の歯車で開く設定（docs/screen-design.md 13.6 / 13.9）。いまここにある群は「画面の色」・
// 「新しいセッションの既定」・「書き上げる演出の速さ」・「訪問」の4つ。
// **保存の仕方は `browser/domain/appearance-color.ts` のまま**なので、鍵も検証も
// `appearance-color.test.ts` と同じものを見ている。演出の速さの保存は
// `browser/domain/reveal-speed.ts`（`reveal-speed.test.ts` と同じ鍵）。

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
  localStorage.removeItem(COLOR_STORAGE_KEY)
  localStorage.removeItem(REVEAL_SPEED_STORAGE_KEY)
  for (const token of COLOR_TOKENS) {
    document.documentElement.style.removeProperty(token)
  }
  themeStyleElement?.remove()
  themeStyleElement = undefined
  // `<TurnSelectionProvider>` は hash の `turn` を正典にする（`stores/turn-selection.tsx`）ので、
  // 次のテストへ持ち越さない。
  window.location.hash = ""
})

function renderScreenNav(state: Partial<SessionState> = {}, spy: CommandSpy = () => {}): void {
  const store = sessionStoreWith({ ...INITIAL_SESSION_STATE, ...state }, spy)
  render(
    <SessionStoreContext.Provider value={store}>
      <TurnSelectionProvider>
        <QuestionScrollProvider>
          <ScreenNav />
        </QuestionScrollProvider>
      </TurnSelectionProvider>
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

  // Esc のときだけ、押した歯車へフォーカスを戻す（「いまの作業」の札と同じ）。
  it("Esc で閉じるとフォーカスが歯車へ戻る", () => {
    renderScreenNav()

    fireEvent.click(gear())
    fireEvent.keyDown(document, { key: "Escape" })

    expect(document.activeElement).toBe(gear())
  })

  // 狭い画面では歯車そのものが「≡」の面の中にあり、Esc は面ごと閉じるので戻り先が消える。
  // **帯の側の歯車（狭い画面では `display: none`）へフォーカスを飛ばさない**ことを守る。
  it("「≡」の面の中の歯車でも Esc で閉じ、隠れている帯の側の歯車へは戻さない", () => {
    renderScreenNav()
    fireEvent.click(document.querySelector(".screen-nav-toggle") as HTMLElement)

    fireEvent.click(
      document.querySelector(".screen-nav-panel .screen-nav-settings-toggle") as HTMLElement,
    )
    expect(panel()).not.toBeNull()

    fireEvent.keyDown(document, { key: "Escape" })

    expect(document.querySelector(".screen-nav-panel")).toBeNull()
    expect(document.activeElement).not.toBe(gear())
    expect(document.activeElement).toBe(document.body)
  })

  it("地・領域・字の色の3つ、新しいセッションの既定の3つ、演出の速さの1つ、訪問の1つを出す", () => {
    renderScreenNav()
    fireEvent.click(gear())

    expect(
      [...document.querySelectorAll(".screen-nav-settings-panel label")].map(
        (node) => node.textContent,
      ),
    ).toEqual([
      "画面の地",
      "領域の地",
      "字の色",
      "モデル",
      "effort",
      "許可モード",
      "速さ",
      "客の出入り",
    ])
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

  // 色の検証は `browser/domain/appearance-color.ts` の1箇所のまま（歯車へ移しても変えていない）。
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

// 新しいセッションの既定（docs/screen-design.md 13.6）。**覚えるのはサーバ**なので、ここが見るのは
// 「届いた値をそのまま出す」「選ぶと `set-session-default` を送る」「全部許すは並べない」の3つ。
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

  it("モデルを選ぶと、いまの effort・許可モードと一緒に set-session-default を送る", () => {
    const sent: unknown[] = []
    renderScreenNav(
      { sessionDefault: { model: "opus", effort: "high", permissionMode: "plan" } },
      (command) => sent.push(command),
    )
    fireEvent.click(gear())

    fireEvent.change(defaultSelect("モデル"), { target: { value: "sonnet" } })

    expect(sent).toEqual([
      { type: "set-session-default", model: "sonnet", effort: "high", permissionMode: "plan" },
    ])
  })

  it("許可モードを選ぶと、いまのモデル・effort と一緒に set-session-default を送る", () => {
    const sent: unknown[] = []
    renderScreenNav(
      { sessionDefault: { model: "haiku", effort: "medium", permissionMode: "auto" } },
      (command) => sent.push(command),
    )
    fireEvent.click(gear())

    fireEvent.change(defaultSelect("許可モード"), { target: { value: "acceptEdits" } })

    expect(sent).toEqual([
      {
        type: "set-session-default",
        model: "haiku",
        effort: "medium",
        permissionMode: "acceptEdits",
      },
    ])
  })

  // 帯のドロップダウン（セッション限り）は既定を書き換えない（`docs/screen-design.md` 13.6）。
  it("帯でモデルを変えても set-session-default は送らない", () => {
    const sent: unknown[] = []
    renderScreenNav(
      { sessionDefault: { model: "opus", effort: "medium", permissionMode: "auto" } },
      (command) => sent.push(command),
    )

    fireEvent.change(
      document.querySelector(
        ".screen-nav > .screen-nav-model-permission select",
      ) as HTMLSelectElement,
      { target: { value: "haiku" } },
    )

    expect(sent).toEqual([{ type: "set-model", model: "haiku" }])
  })
})

// effort の欄（帯の判定 `resolveEffortSelect` をそのまま再利用する。`docs/screen-design.md`
// 13.6）。**帯のドロップダウンと同じ対応表（`modelEffortSupport`）から、既定のモデルの対応を
// 引く**ので、帯といま出しているモデルが違っても既定のモデルの対応がそのまま出る。
describe("設定の歯車（新しいセッションの既定の effort）", () => {
  const OPUS_SUPPORT = {
    model: "opus",
    supportsEffort: true,
    effortLevels: ["low", "medium", "high", "xhigh", "max"],
  } as const
  const HAIKU_SUPPORT = { model: "haiku", supportsEffort: false, effortLevels: [] } as const

  it("対応表がまだ届いていないうちは選べず、title に理由が出る", () => {
    renderScreenNav()
    fireEvent.click(gear())

    const select = defaultSelect("effort")
    expect(select.disabled).toBe(true)
    expect(select.title.length).toBeGreaterThan(0)
  })

  it("対応表が届いていれば、選べる段だけを選択肢にして既定の effort を選択する", () => {
    renderScreenNav({
      sessionDefault: { model: "opus", effort: "high", permissionMode: "auto" },
      modelEffortSupport: [OPUS_SUPPORT],
    })
    fireEvent.click(gear())

    const select = defaultSelect("effort")
    expect(select.disabled).toBe(false)
    expect(select.value).toBe("high")
    expect([...select.options].map((option) => option.value)).toEqual([
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ])
  })

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

  it("effort を選ぶと、いまのモデル・許可モードと一緒に set-session-default を送る", () => {
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
      { type: "set-session-default", model: "opus", effort: "xhigh", permissionMode: "plan" },
    ])
  })
})

/** ポップオーバーの中の既定の `<select>`（ラベルは `<label for>` で結んである）。 */
function defaultSelect(label: string): HTMLSelectElement {
  const labelNode = [...document.querySelectorAll(".screen-nav-settings-panel label")].find(
    (node) => node.textContent === label,
  ) as HTMLLabelElement
  return document.getElementById(labelNode.htmlFor) as HTMLSelectElement
}

// 書き上げる演出の速さ（docs/screen-design.md 13.6。`browser/domain/reveal-speed.ts`）。**利用者の設定**
// なので色と同じ `localStorage`（保存先は違う鍵）。
describe("設定の歯車（書き上げる演出の速さ）", () => {
  it("既定は「標準」", () => {
    renderScreenNav()
    fireEvent.click(gear())

    expect(defaultSelect("速さ").value).toBe("standard")
  })

  it("選ぶとすぐ localStorage に保存される（色と違いデバウンスしない）", () => {
    renderScreenNav()
    fireEvent.click(gear())

    fireEvent.change(defaultSelect("速さ"), { target: { value: "fast" } })

    expect(localStorage.getItem(REVEAL_SPEED_STORAGE_KEY)).toBe("fast")
  })

  it("「切る」も選べる", () => {
    renderScreenNav()
    fireEvent.click(gear())

    fireEvent.change(defaultSelect("速さ"), { target: { value: "off" } })

    expect(localStorage.getItem(REVEAL_SPEED_STORAGE_KEY)).toBe("off")
  })

  // 保存済みの選択を `useState` の初期値として読むだけなので、リロードして開き直した形を作る。
  it("保存済みの選択が、開いたときの操作子の値に出る（リロードしても残る）", () => {
    localStorage.setItem(REVEAL_SPEED_STORAGE_KEY, "fast")

    renderScreenNav()
    fireEvent.click(gear())

    expect(defaultSelect("速さ").value).toBe("fast")
  })

  it("読めない値は「標準」に畳む", () => {
    localStorage.setItem(REVEAL_SPEED_STORAGE_KEY, "very-fast")

    renderScreenNav()
    fireEvent.click(gear())

    expect(defaultSelect("速さ").value).toBe("standard")
  })
})

// 訪問のオン・オフ（docs/screen-design.md 13.6・13.9）。**覚えるのはいま動いているセッションの
// 値だけ**（ディスクには覚えない）ので、ここが見るのは「届いた値をそのまま出す」「選ぶと
// `set-visit-enabled` を送る」の2つ。
describe("設定の歯車（訪問）", () => {
  it("届いた値をそのまま出す（既定は「する」）", () => {
    renderScreenNav()
    fireEvent.click(gear())

    expect(defaultSelect("客の出入り").value).toBe("on")
  })

  it("visitEnabled が false なら「しない」を出す", () => {
    renderScreenNav({ visitEnabled: false })
    fireEvent.click(gear())

    expect(defaultSelect("客の出入り").value).toBe("off")
  })

  it("「しない」を選ぶと set-visit-enabled を送る", () => {
    const sent: unknown[] = []
    renderScreenNav({ visitEnabled: true }, (command) => sent.push(command))
    fireEvent.click(gear())

    fireEvent.change(defaultSelect("客の出入り"), { target: { value: "off" } })

    expect(sent).toEqual([{ type: "set-visit-enabled", enabled: false }])
  })

  it("「する」を選ぶと set-visit-enabled を送る", () => {
    const sent: unknown[] = []
    renderScreenNav({ visitEnabled: false }, (command) => sent.push(command))
    fireEvent.click(gear())

    fireEvent.change(defaultSelect("客の出入り"), { target: { value: "on" } })

    expect(sent).toEqual([{ type: "set-visit-enabled", enabled: true }])
  })
})
