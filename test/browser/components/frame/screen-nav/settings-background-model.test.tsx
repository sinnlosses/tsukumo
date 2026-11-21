import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { ScreenNav } from "../../../../../src/browser/components/frame/screen-nav/screen-nav.tsx"
import { useNavDrawer } from "../../../../../src/browser/stores/nav-drawer.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../src/shared/session/session-state.ts"
import { typedElement } from "../../../../typed-element.ts"
import { EMPTY_NAV_DRAWER_SLOTS } from "../../../nav-drawer-slot.tsx"
import { stubPhoneWidth } from "../../../phone-width.ts"
import { queryClientWrapper } from "../../../query-client.tsx"
import { putSession } from "../../../session-store.ts"

// 設定の「新しいセッション」の面の下の、裏方のモデルの群。

beforeEach(() => {
  stubPhoneWidth(true)
})

afterEach(() => {
  cleanup()
  useNavDrawer.setState(useNavDrawer.getInitialState(), true)
  window.location.hash = ""
})

function openedDialog(
  sent: unknown[],
  backgroundModels: SessionState["backgroundModels"] = {
    recommendation: "haiku",
    welcomeGreeting: "sonnet",
    chatConsolidation: "haiku",
    characterGeneration: "opus",
  },
): HTMLElement {
  putSession(
    {
      ...INITIAL_SESSION_STATE,
      backgroundModels,
    },
    (command) => sent.push(command),
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
  fireEvent.click(within(dialog).getByRole("button", { name: "新しいセッション" }))
  return dialog
}

function select(dialog: HTMLElement, label: string): HTMLSelectElement {
  return typedElement(
    dialog.querySelector(`select[aria-label='裏方のモデル（${label}）']`),
    HTMLSelectElement,
    `${label}の select`,
  )
}

describe("設定の歯車（裏方のモデル）", () => {
  it("既定のままでも畳まずに、4つの選択を群の中に出す", () => {
    const dialog = openedDialog([], INITIAL_SESSION_STATE.backgroundModels)

    expect(dialog.querySelector("details")).toBeNull()
    const group = within(dialog).getByRole("group", { name: /^裏方のモデル/u })
    expect(within(group).getAllByRole("combobox")).toHaveLength(4)
  })

  it("届いた値を役ごとに出す", () => {
    const dialog = openedDialog([])

    expect(
      ["おすすめ", "迎えの一言", "雑談の記憶の整理", "キャラクターの生成"].map(
        (label) => select(dialog, label).value,
      ),
    ).toEqual(["haiku", "sonnet", "haiku", "opus"])
  })

  it("1つ選ぶと、残りの3つはいまの値を写して session.setBackgroundModels を送る", () => {
    const sent: unknown[] = []
    const dialog = openedDialog(sent)

    fireEvent.change(select(dialog, "迎えの一言"), { target: { value: "haiku" } })

    expect(sent).toEqual([
      {
        procedure: "session.setBackgroundModels",
        recommendation: "haiku",
        welcomeGreeting: "haiku",
        chatConsolidation: "haiku",
        characterGeneration: "opus",
      },
    ])
  })
})
