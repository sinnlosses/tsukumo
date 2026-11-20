import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { ScreenNav } from "../../../../../src/browser/components/frame/screen-nav/screen-nav.tsx"
import { useFirstNoteSeen } from "../../../../../src/browser/stores/first-note-seen.ts"
import { useNavDrawer } from "../../../../../src/browser/stores/nav-drawer.ts"
import {
  BUILTIN_GEAR_PREFERENCES,
  type AppearanceAdjust,
} from "../../../../../src/shared/session/gear-preference.ts"
import { INITIAL_SESSION_STATE } from "../../../../../src/shared/session/session-state.ts"
import { characterInfo } from "../../../../fixture/character.ts"
import { typedElement } from "../../../../typed-element.ts"
import { EMPTY_NAV_DRAWER_SLOTS } from "../../../nav-drawer-slot.tsx"
import { stubPhoneWidth } from "../../../phone-width.ts"
import { queryClientWrapper } from "../../../query-client.tsx"
import {
  echoGearPreference,
  putSession,
  putState,
  stateWith,
  type CommandSpy,
  type SentCommand,
} from "../../../session-store.ts"

// 設定の「見た目」の面の、背景の暗さ・パネルのぼかし・パネルの濃さの範囲入力。

const ROOT_TOKENS = [
  "--character-background-veil-user",
  "--panel-blur-user",
  "--panel-fill-user",
] as const

beforeEach(() => {
  stubPhoneWidth(true)
})

afterEach(() => {
  cleanup()
  useNavDrawer.setState(useNavDrawer.getInitialState(), true)
  window.location.hash = ""
  localStorage.clear()
  useFirstNoteSeen.setState({ seen: [] })
  for (const name of ROOT_TOKENS) {
    document.documentElement.style.removeProperty(name)
  }
})

function openLookFace(
  sent: SentCommand[] = [],
  appearanceAdjust: AppearanceAdjust = BUILTIN_GEAR_PREFERENCES.appearanceAdjust,
  spy: CommandSpy = echoGearPreference(sent),
): HTMLElement {
  putSession(
    {
      ...INITIAL_SESSION_STATE,
      gearPreferences: { ...BUILTIN_GEAR_PREFERENCES, appearanceAdjust },
    },
    spy,
  )
  render(<ScreenNav drawer={EMPTY_NAV_DRAWER_SLOTS} />, { wrapper: queryClientWrapper() })
  fireEvent.click(
    typedElement(
      document.querySelector(".screen-nav > .screen-nav-settings .screen-nav-settings-toggle"),
      HTMLElement,
      "帯の歯車",
    ),
  )
  const dialog = screen.getByRole("dialog", { name: "設定" })
  fireEvent.click(within(dialog).getByRole("button", { name: "見た目" }))
  return dialog
}

function slider(dialog: HTMLElement, name: string): HTMLInputElement {
  return typedElement(within(dialog).getByRole("slider", { name }), HTMLInputElement, name)
}

function rootToken(name: string): string {
  return document.documentElement.style.getPropertyValue(name)
}

describe("設定の歯車（初回の説明）", () => {
  it("「初回の説明をもう一度出す」で、見た説明の記憶が消える", () => {
    useFirstNoteSeen.getState().markSeen("inquiry-terms")
    const dialog = openLookFace()
    expect(useFirstNoteSeen.getState().seen).toEqual(["inquiry-terms"])

    fireEvent.click(within(dialog).getByRole("button", { name: "初回の説明をもう一度出す" }))

    expect(useFirstNoteSeen.getState().seen).toEqual([])
    expect(JSON.parse(localStorage.getItem("tsukumo-first-note-seen:v1") ?? "null")).toEqual([])
  })
})

describe("設定の歯車（見た目の調整）", () => {
  it("3つの範囲入力が名前つきで、範囲と既定の位置を持つ", () => {
    const dialog = openLookFace()

    const veil = slider(dialog, "背景の暗さ")
    const blur = slider(dialog, "パネルのぼかし")
    const fill = slider(dialog, "パネルの濃さ")

    expect([veil.min, veil.max]).toEqual(["70", "100"])
    expect([blur.min, blur.max, blur.value]).toEqual(["0", "24", "8"])
    expect([fill.min, fill.max, fill.value]).toEqual(["20", "90", "45"])
    expect(within(dialog).getByText("75%（パックの値）")).toBeTruthy()
  })

  it("動かすと値が documentElement のトークンに出て、3つ揃えた値を覚えさせる", () => {
    const sent: SentCommand[] = []
    const dialog = openLookFace(sent)

    fireEvent.change(slider(dialog, "背景の暗さ"), { target: { value: "90" } })
    fireEvent.change(slider(dialog, "パネルのぼかし"), { target: { value: "0" } })
    fireEvent.change(slider(dialog, "パネルの濃さ"), { target: { value: "70" } })

    expect([
      rootToken("--character-background-veil-user"),
      rootToken("--panel-blur-user"),
      rootToken("--panel-fill-user"),
    ]).toEqual(["0.9", "0px", "70%"])
    expect(sent.at(-1)).toEqual({
      procedure: "session.setGearPreference",
      field: "appearanceAdjust",
      value: { veil: 0.9, blur: 0, fill: 70 },
    })
    expect(within(dialog).queryByText(/パックの値/)).toBeNull()
  })

  it("覚えた値が届く前に続けて動かしても、前に動かした値を消さずに覚えさせる", () => {
    const sent: SentCommand[] = []
    const dialog = openLookFace(sent, BUILTIN_GEAR_PREFERENCES.appearanceAdjust, (command) => {
      sent.push(command)
    })

    fireEvent.change(slider(dialog, "背景の暗さ"), { target: { value: "90" } })
    fireEvent.change(slider(dialog, "パネルのぼかし"), { target: { value: "18" } })
    fireEvent.change(slider(dialog, "パネルの濃さ"), { target: { value: "70" } })

    expect(sent.at(-1)).toEqual({
      procedure: "session.setGearPreference",
      field: "appearanceAdjust",
      value: { veil: 0.9, blur: 18, fill: 70 },
    })
  })

  it("既定に戻すと、背景の暗さのトークンが外れてパックの値へ戻る", () => {
    const dialog = openLookFace()
    fireEvent.change(slider(dialog, "背景の暗さ"), { target: { value: "90" } })
    fireEvent.change(slider(dialog, "パネルのぼかし"), { target: { value: "20" } })

    fireEvent.click(within(dialog).getByRole("button", { name: /^このページを既定に戻す/u }))

    expect(rootToken("--character-background-veil-user")).toBe("")
    expect(rootToken("--panel-blur-user")).toBe("8px")
    expect(slider(dialog, "パネルのぼかし").value).toBe("8")
    expect(within(dialog).getByText("75%（パックの値）")).toBeTruthy()
  })

  it("動かしていない間は、いま効いているパックの暗さを読み出しと操作子に出す", () => {
    const dialog = openLookFace()
    expect(within(dialog).getByText("75%（パックの値）")).toBeTruthy()

    act(() => {
      putState(
        stateWith({
          character: characterInfo({
            background: { image: "/character/fictional/bg.png", veil: 0.9 },
          }),
        }),
      )
    })

    expect(within(dialog).getByText("90%（パックの値）")).toBeTruthy()
    expect(slider(dialog, "背景の暗さ").value).toBe("90")
  })

  it("覚えた値で開くと、操作子がその値を出す", () => {
    const dialog = openLookFace([], { veil: 0.85, blur: 16, fill: 30 })

    expect([
      slider(dialog, "背景の暗さ").value,
      slider(dialog, "パネルのぼかし").value,
      slider(dialog, "パネルの濃さ").value,
    ]).toEqual(["85", "16", "30"])
  })
})
