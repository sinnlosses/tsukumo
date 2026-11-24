// ScreenNav の単体テストが共有する下ごしらえ（狭い画面・ストアと URL の巻き戻し・描画）。

import { cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, vi } from "vitest"

import { ScreenNav } from "../../src/browser/components/frame/screen-nav/screen-nav.tsx"
import { useNavDrawer } from "../../src/browser/stores/nav-drawer.ts"
import type { StampedPendingAsk } from "../../src/shared/session-driver/pending-ask.ts"
import { INITIAL_SESSION_STATE, type SessionState } from "../../src/shared/session/session-state.ts"
import { setPageUrl } from "../dom-setup.ts"
import { MARKED_NAV_DRAWER_SLOTS } from "./nav-drawer-slot.tsx"
import { stubPhoneWidth } from "./phone-width.ts"
import { queryClientWrapper } from "./query-client.tsx"
import { type CommandSpy, putSession } from "./session-store.ts"

export const FIXTURE_PENDING: StampedPendingAsk = {
  kind: "permission",
  id: "ask-1",
  toolName: "Read",
  input: {},
  askedAt: 0,
}

// 部屋の名前はこのページを配っているポートから決まる（`roomName`）ので、
// ポートを見るテストは URL ごと差し替える。既定へ戻すのは afterEach。
export const DEFAULT_PAGE_URL = "http://127.0.0.1/"

/** ファイルの最上位で呼ぶ。各テストの前に狭い画面にし、後でストア・URL・ハッシュを戻す。 */
export function useScreenNavHarness(): void {
  beforeEach(() => {
    stubPhoneWidth(true)
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    useNavDrawer.setState(useNavDrawer.getInitialState(), true)
    setPageUrl(DEFAULT_PAGE_URL)
    window.location.hash = ""
  })
}

export function renderScreenNav(
  state: Partial<SessionState> = {},
  spy: CommandSpy = () => {},
): void {
  putSession({ ...INITIAL_SESSION_STATE, ...state }, spy)
  render(<ScreenNav drawer={MARKED_NAV_DRAWER_SLOTS} />, { wrapper: queryClientWrapper() })
}
