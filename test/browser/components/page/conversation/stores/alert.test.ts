import { act } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAlert } from "../../../../../../src/browser/components/page/conversation/stores/alert.ts"
import {
  DEFAULT_ALERT_SETTING,
  saveAlertSetting,
} from "../../../../../../src/browser/stores/alert-setting.ts"
import { useSession } from "../../../../../../src/browser/stores/session.ts"
import { ringBell } from "../../../../../../src/browser/utils/bell.ts"
import type { SessionEvent } from "../../../../../../src/shared/session/session-event.ts"
import { INITIAL_SESSION_STATE } from "../../../../../../src/shared/session/session-state.ts"
import { requestEvent } from "../../../../../fixture/session-event.ts"
import { putSession } from "../../../../session-store.ts"

vi.mock("../../../../../../src/browser/utils/bell.ts", () => ({
  primeBell: vi.fn<() => void>(),
  ringBell: vi.fn<() => void>(),
}))

/** 出した通知を控える代役。`permission` はテストごとに替える。 */
class FakeNotification {
  static permission: NotificationPermission = "granted"
  static made: FakeNotification[] = []
  readonly title: string
  readonly options: NotificationOptions
  readonly close = vi.fn<() => void>()

  constructor(title: string, options: NotificationOptions) {
    this.title = title
    this.options = options
    FakeNotification.made.push(this)
  }

  addEventListener(): void {}
}

const PERMISSION = {
  kind: "pending-changed",
  pending: [{ kind: "permission", id: "ask-1", toolName: "Read", input: {} }],
} as const satisfies SessionEvent
const FAILED = {
  kind: "turn-finished",
  outcome: { kind: "failed", cause: { kind: "max-turns" } },
} as const satisfies SessionEvent
const COMPLETED = {
  kind: "turn-finished",
  outcome: { kind: "completed" },
} as const satisfies SessionEvent

let visibility: DocumentVisibilityState = "hidden"
let focused = false

beforeEach(() => {
  visibility = "hidden"
  focused = false
  FakeNotification.permission = "granted"
  FakeNotification.made = []
  vi.stubGlobal("Notification", FakeNotification)
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility)
  vi.spyOn(document, "hasFocus").mockImplementation(() => focused)
  saveAlertSetting({ ...DEFAULT_ALERT_SETTING, notify: true, bell: true })
  putSession(INITIAL_SESSION_STATE)
  act(() => {
    useAlert.setState(useAlert.getInitialState(), true)
  })
  vi.mocked(ringBell).mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  localStorage.clear()
})

function receive(...events: readonly SessionEvent[]): void {
  act(() => {
    useSession.getState().receive({
      type: "events",
      events: events.map((event) => ({ at: 0, event })),
    })
  })
}

describe("useAlert", () => {
  it("画面を見ているあいだは、通知も鈴も出さない", () => {
    visibility = "visible"
    focused = true

    receive(requestEvent(), PERMISSION)

    expect(FakeNotification.made).toEqual([])
    expect(ringBell).not.toHaveBeenCalled()
  })

  it("背面では、選んだ出来事だけ通知と鈴を出す（終わったは既定で出さない）", () => {
    receive(requestEvent(), COMPLETED)
    expect(FakeNotification.made).toEqual([])

    receive(requestEvent(), FAILED)
    expect(FakeNotification.made.map((made) => made.options.tag)).toEqual(["tsukumo-failure"])
    expect(FakeNotification.made[0]?.options.body).toBe("失敗で止まった")
    expect(ringBell).toHaveBeenCalledTimes(1)
  })

  it("同じ鍵の出来事は1回だけ出す", () => {
    receive(requestEvent(), PERMISSION)
    receive({ kind: "speech", text: "架空", expression: "default" })
    receive(PERMISSION)

    expect(FakeNotification.made).toHaveLength(1)
  })

  it("見える状態に戻ると、出した通知を閉じる", () => {
    receive(requestEvent(), PERMISSION)
    const [made] = FakeNotification.made

    visibility = "visible"
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"))
    })

    expect(made?.close).toHaveBeenCalledTimes(1)
    expect(useAlert.getState().shown).toEqual([])
  })

  it("許しが無ければ通知は出さず、鈴だけ鳴らす", () => {
    FakeNotification.permission = "denied"

    receive(requestEvent(), PERMISSION)

    expect(FakeNotification.made).toEqual([])
    expect(ringBell).toHaveBeenCalledTimes(1)
  })

  it("通知と鈴を切っていれば何も出さない", () => {
    saveAlertSetting(DEFAULT_ALERT_SETTING)

    receive(requestEvent(), PERMISSION)

    expect(FakeNotification.made).toEqual([])
    expect(ringBell).not.toHaveBeenCalled()
  })
})
