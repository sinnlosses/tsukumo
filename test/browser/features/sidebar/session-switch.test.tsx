import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { SessionSwitch } from "../../../../src/browser/features/sidebar/session-switch.tsx"
import { SessionStoreContext } from "../../../../src/browser/stores/session.tsx"
import { FRAME_ERROR_REASON } from "../../../../src/shared/frame.ts"
import { type SessionChoice } from "../../../../src/shared/session-choice.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionInfo,
  type SessionState,
} from "../../../../src/shared/session-state.ts"
import { type CommandSpy, sessionStoreWith } from "../../session-store.ts"

afterEach(() => {
  cleanup()
})

// 一覧に会話の内容は入らない（目印・ID・最終更新時刻だけ）。時刻は手で書いた架空の瞬間。
const EARLIER = Temporal.ZonedDateTime.from("2026-09-20T09:05:00+09:00[Asia/Tokyo]")
const LATER = Temporal.ZonedDateTime.from("2026-09-22T15:36:00+09:00[Asia/Tokyo]")

const SESSIONS: readonly SessionChoice[] = [
  { viewPort: 7328, sessionId: "s-other", lastModified: LATER.epochMilliseconds },
  { viewPort: 7327, sessionId: "s-current", lastModified: EARLIER.epochMilliseconds },
]

/**
 * `sessionId` だけ分かっている架空の土台。**このテストが見るのはセッションの切り替えだけ**
 * （`model` / `permissionMode` は関係ない）ので、`init` 前でも `sessionId` だけ分かる
 * `identified` を使う（`sessions-changed` が `init` より先に届く経路と同じ形）。
 */
function identifiedSession(sessionId: string): Extract<SessionInfo, { kind: "identified" }> {
  return { kind: "identified", sessionId }
}

function renderSessionSwitch(
  stateOverrides: Partial<SessionState>,
  dispatch: CommandSpy = () => {},
): void {
  const store = sessionStoreWith({ ...INITIAL_SESSION_STATE, ...stateOverrides }, dispatch)
  render(
    <SessionStoreContext.Provider value={store}>
      <SessionSwitch />
    </SessionStoreContext.Provider>,
  )
}

/**
 * 画面に出るはずの `M/D HH:MM`。**この端末のタイムゾーンで組み立てる**ので、どこで回しても
 * 同じ判定になる（部品と同じ「ローカル時刻」の約束を、別の道筋で組み立てて突き合わせる）。
 */
function localLabel(at: Temporal.ZonedDateTime): string {
  const local = at.toInstant().toZonedDateTimeISO(Temporal.Now.timeZoneId())
  const time = local.toPlainTime().toString({ smallestUnit: "minute" })
  return `${String(local.month)}/${String(local.day)} ${time}`
}

function options(select: HTMLElement): readonly string[] {
  return [...(select as HTMLSelectElement).options].map((option) => option.textContent ?? "")
}

describe("SessionSwitch", () => {
  it("切り替え先が届くまでは、行ごと出さない", () => {
    renderSessionSwitch({})

    expect(screen.queryByLabelText("セッション")).toBeNull()
  })

  // 目印は**部屋の名前**として出す（`src/shared/room.ts`。ポートの並び順に割り当たる）。
  it("部屋の名前と最終更新時刻（ローカル時刻）を並べ、いま出しているものに印を付ける", () => {
    renderSessionSwitch({ sessions: SESSIONS, session: identifiedSession("s-current") })

    const select = screen.getByLabelText("セッション")
    expect((select as HTMLSelectElement).value).toBe("s-current")
    expect(options(select)).toEqual([
      `萌黄の間・${localLabel(LATER)}`,
      `浅葱の間・${localLabel(EARLIER)}（表示中）`,
    ])
  })

  // 語彙の外のポート（13個め以降・遠い番号）は、今までどおり番号のまま出る。
  it("名前が無いポートの行は、ポート番号をそのまま出す", () => {
    renderSessionSwitch({
      sessions: [{ viewPort: 9000, sessionId: "s-far", lastModified: LATER.epochMilliseconds }],
      session: identifiedSession("s-far"),
    })

    expect(options(screen.getByLabelText("セッション"))).toEqual([
      `9000・${localLabel(LATER)}（表示中）`,
    ])
  })

  it("新規に起こしてIDも分からないうちは、先頭に「記録前」を出す", () => {
    // 印はターンが終わって3秒後に付く。新規に起こしたセッションは一覧にも `current` にも
    // 入らないので、選択の受け皿だけを置く。
    renderSessionSwitch({ sessions: SESSIONS })

    const select = screen.getByLabelText("セッション")
    expect((select as HTMLSelectElement).value).toBe("")
    expect(options(select)[0]).toBe("いまのセッション（記録前）")
  })

  it("一覧の上限から漏れたセッションに居るときは、先頭に「いまのセッション」を出す", () => {
    renderSessionSwitch({ sessions: SESSIONS, session: identifiedSession("s-old") })

    const select = screen.getByLabelText("セッション")
    expect((select as HTMLSelectElement).value).toBe("s-old")
    expect(options(select)[0]).toBe("いまのセッション")
  })

  it("選ぶと switch-session が dispatch される", () => {
    const sent: unknown[] = []
    renderSessionSwitch(
      { sessions: SESSIONS, session: identifiedSession("s-current") },
      (command) => {
        sent.push(command)
      },
    )

    fireEvent.change(screen.getByLabelText("セッション"), { target: { value: "s-other" } })

    expect(sent).toEqual([{ type: "switch-session", sessionId: "s-other" }])
  })

  it("いま出しているものを選び直しても、起こし直さない", () => {
    const sent: unknown[] = []
    renderSessionSwitch(
      { sessions: SESSIONS, session: identifiedSession("s-current") },
      (command) => {
        sent.push(command)
      },
    )

    fireEvent.change(screen.getByLabelText("セッション"), { target: { value: "s-current" } })

    expect(sent).toEqual([])
  })

  it("ターン進行中は塞ぎ、理由をサーバと同じ定型文で見せる", () => {
    renderSessionSwitch({
      sessions: SESSIONS,
      session: identifiedSession("s-current"),
      turn: { kind: "running", startedAt: 0 },
    })

    const select = screen.getByLabelText("セッション")
    expect((select as HTMLSelectElement).disabled).toBe(true)
    expect(select.getAttribute("title")).toBe(FRAME_ERROR_REASON.sessionSwitchDuringTurn)
  })
})
