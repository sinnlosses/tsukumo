import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { ScreenNav } from "../../../../../src/browser/components/frame/screen-nav/screen-nav.tsx"
import { useNavDrawer } from "../../../../../src/browser/stores/nav-drawer.ts"
import { INITIAL_SESSION_STATE } from "../../../../../src/shared/session/session-state.ts"
import { typedElement } from "../../../../typed-element.ts"
import { EMPTY_NAV_DRAWER_SLOTS } from "../../../nav-drawer-slot.tsx"
import { stubPhoneWidth } from "../../../phone-width.ts"
import { queryClientWrapper } from "../../../query-client.tsx"
import { putSession } from "../../../session-store.ts"

// 設定の「演出」の面の下の、話しかける間合いの群。

beforeEach(() => {
  stubPhoneWidth(true)
})

afterEach(() => {
  cleanup()
  useNavDrawer.setState(useNavDrawer.getInitialState(), true)
  window.location.hash = ""
})

function openedDialog(sent: unknown[]): HTMLElement {
  putSession(
    {
      ...INITIAL_SESSION_STATE,
      speakingPace: {
        remembered: { waitingLine: "5m", progressNudge: "10m" },
        launchedWaitingLine: "2m",
      },
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
  fireEvent.click(within(dialog).getByRole("button", { name: "演出" }))
  return dialog
}

function select(dialog: HTMLElement, label: string): HTMLSelectElement {
  return typedElement(
    dialog.querySelector(`select[aria-label='話しかける間合い（${label}）']`),
    HTMLSelectElement,
    `${label}の select`,
  )
}

describe("設定の歯車（話しかける間合い）", () => {
  it("覚えた値を2つとも出す（動いているセッションの値ではない）", () => {
    const dialog = openedDialog([])

    expect(["待ちの一言", "進み具合の催促"].map((label) => select(dialog, label).value)).toEqual([
      "5m",
      "10m",
    ])
  })

  it("1つ選ぶと、もう1つはいまの値を写して session.setSpeakingPace を送る", () => {
    const sent: unknown[] = []
    const dialog = openedDialog(sent)

    fireEvent.change(select(dialog, "待ちの一言"), { target: { value: "off" } })

    expect(sent).toEqual([
      { procedure: "session.setSpeakingPace", waitingLine: "off", progressNudge: "10m" },
    ])
  })
})
