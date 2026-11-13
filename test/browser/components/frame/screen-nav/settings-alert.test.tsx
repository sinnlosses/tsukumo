import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SettingsScreen } from "../../../../../src/browser/components/frame/screen-nav/settings-screen.tsx"
import { loadAlertSetting } from "../../../../../src/browser/stores/alert-setting.ts"
import { INITIAL_SESSION_STATE } from "../../../../../src/shared/session/session-state.ts"
import { queryClientWrapper } from "../../../query-client.tsx"
import { stubRpcFetch, type RpcFetchStub } from "../../../rpc-fetch-stub.ts"
import { putSession } from "../../../session-store.ts"

// 設定の紙の「知らせ」の群。通知の許しは入れた操作の中で求め、断られたら切に戻す。

const REFUSED_NOTE = "ブラウザが通知を断ったので、タブの題だけで知らせる"

let rpcStub: RpcFetchStub | undefined

beforeEach(() => {
  rpcStub = stubRpcFetch(() => ({ kind: "pending" }))
  putSession(INITIAL_SESSION_STATE)
})

afterEach(() => {
  cleanup()
  rpcStub?.restore()
  rpcStub = undefined
  vi.unstubAllGlobals()
  localStorage.clear()
})

function stubNotification(
  permission: NotificationPermission,
  answer: NotificationPermission,
): ReturnType<typeof vi.fn<() => Promise<NotificationPermission>>> {
  const requestPermission = vi.fn<() => Promise<NotificationPermission>>(() =>
    Promise.resolve(answer),
  )
  vi.stubGlobal("Notification", { permission, requestPermission })
  return requestPermission
}

function select(label: string): HTMLElement {
  return screen.getByLabelText(label)
}

async function choose(label: string, value: "on" | "off"): Promise<void> {
  // 許しを待つ Promise が解けるまで流す。
  await act(async () => {
    fireEvent.change(select(label), { target: { value } })
    await Promise.resolve()
  })
}

function renderSheet(): void {
  render(<SettingsScreen />, { wrapper: queryClientWrapper() })
}

describe("設定の紙（知らせ）", () => {
  it("通知を入れると許しを求め、許されたら入のまま保存する", async () => {
    const requestPermission = stubNotification("default", "granted")
    renderSheet()

    await choose("通知", "on")

    expect(requestPermission).toHaveBeenCalledTimes(1)
    expect(loadAlertSetting().notify).toBe(true)
    expect(screen.queryByText(REFUSED_NOTE)).toBeNull()
  })

  it("許しを断られたら切に戻して保存し、注記を出す", async () => {
    stubNotification("default", "denied")
    renderSheet()

    await choose("通知", "on")

    expect(loadAlertSetting().notify).toBe(false)
    expect(screen.getByText(REFUSED_NOTE)).toBeDefined()
  })

  it("Notification が無いブラウザでは、求めずに切に戻す", async () => {
    vi.stubGlobal("Notification", undefined)
    renderSheet()

    await choose("通知", "on")

    expect(loadAlertSetting().notify).toBe(false)
    expect(screen.getByText(REFUSED_NOTE)).toBeDefined()
  })

  it("出す出来事を切ると、保存の値が変わる", async () => {
    renderSheet()

    await choose("失敗で止まったとき", "off")
    await choose("終わったとき", "on")

    expect(loadAlertSetting().events).toEqual({
      question: true,
      permission: true,
      failure: false,
      finished: true,
    })
  })
})
