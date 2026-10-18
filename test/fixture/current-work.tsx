// 帯の「いまの作業」の札のテストが共有する、画面の差し込みと札の取り出し。

import { render } from "@testing-library/react"

import { ScreenNav } from "../../src/browser/components/domain/screen-nav/screen-nav.tsx"
import { INITIAL_SESSION_STATE, type SessionState } from "../../src/shared/session/session-state.ts"
import { EMPTY_NAV_DRAWER_SLOTS } from "../browser/nav-drawer-slot.tsx"
import { queryClientWrapper } from "../browser/query-client.tsx"
import { putSession } from "../browser/session-store.ts"
import { typedElement } from "../typed-element.ts"

/**
 * 帯の札を描く。会話の画面の帯には札が無い（メインビューの進み具合の帯が代わる）ので、hash が空ならキャラクター画面で見る。
 * 画面を自分で決めたいテストは、呼ぶ前に hash を書く。
 */
export function renderScreenNav(state: Partial<SessionState> = {}): void {
  if (window.location.hash === "") {
    window.location.hash = "#character"
  }
  putSession({ ...INITIAL_SESSION_STATE, ...state })
  render(<ScreenNav drawer={EMPTY_NAV_DRAWER_SLOTS} />, { wrapper: queryClientWrapper() })
}

/** 帯（広い画面）にある「いまの作業」の札。 */
export function workToggle(): HTMLElement {
  return typedElement(
    document.querySelector(".screen-nav > .screen-nav-work-slot .current-work-toggle"),
    HTMLElement,
    "帯のいまの作業の札",
  )
}
