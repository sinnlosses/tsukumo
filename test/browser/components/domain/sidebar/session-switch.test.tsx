import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { SessionSwitch } from "../../../../../src/browser/components/domain/sidebar/session-switch.tsx"
import { SessionStoreContext } from "../../../../../src/browser/stores/session.tsx"
import { FRAME_ERROR_REASON } from "../../../../../src/shared/frame.ts"
import { type SessionChoice } from "../../../../../src/shared/session-choice.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionInfo,
  type SessionState,
} from "../../../../../src/shared/session-state.ts"
import { type CommandSpy, sessionStoreWith } from "../../../session-store.ts"

afterEach(() => {
  cleanup()
})

// 見出しは作り物の文字列（docs/coding-standards.md「会話内容の扱い」）。時刻は手で書いた架空の瞬間。
const EARLIER = Temporal.ZonedDateTime.from("2026-09-20T09:05:00+09:00[Asia/Tokyo]")
const LATER = Temporal.ZonedDateTime.from("2026-09-22T15:36:00+09:00[Asia/Tokyo]")

const SESSIONS: readonly SessionChoice[] = [
  {
    viewPort: 7328,
    sessionId: "s-other",
    lastModified: LATER.epochMilliseconds,
    heading: "架空の作業その1",
  },
  {
    viewPort: 7327,
    sessionId: "s-current",
    lastModified: EARLIER.epochMilliseconds,
    heading: "架空の作業その2",
  },
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

  // 一覧はいまの部屋のものだけなので部屋の名前では見分けが付かない。見分けるのは
  // SDK の見出し（`heading`）と最終更新時刻。
  it("見出しと最終更新時刻（ローカル時刻）を並べ、いま出しているものに印を付ける", () => {
    renderSessionSwitch({ sessions: SESSIONS, session: identifiedSession("s-current") })

    const select = screen.getByLabelText("セッション")
    expect((select as HTMLSelectElement).value).toBe("s-current")
    expect(options(select)).toEqual([
      `架空の作業その1・${localLabel(LATER)}`,
      `架空の作業その2・${localLabel(EARLIER)}（表示中）`,
    ])
  })

  // SDK の `summary` が空・読めないときは `SessionChoice.heading` が undefined になる
  // （`src/server/core/session-restore.ts`）。行から見出しが消えないよう代わりの字を出す。
  it("見出しが無いときは「（題なし）」を代わりに出す", () => {
    renderSessionSwitch({
      sessions: [
        {
          viewPort: 7327,
          sessionId: "s-untitled",
          lastModified: LATER.epochMilliseconds,
          heading: undefined,
        },
      ],
      session: identifiedSession("s-untitled"),
    })

    expect(options(screen.getByLabelText("セッション"))).toEqual([
      `（題なし）・${localLabel(LATER)}（表示中）`,
    ])
  })

  // `<select>` の選択肢は折り返せないので、見出しは文字数で切る。**時刻は切らない**
  // （同じ部屋の行を見分けるのは時刻なので、見出しがどれだけ長くても必ず残す）。
  it("長い見出しは文字数で切り、時刻はそのまま残す", () => {
    const longHeading = "あ".repeat(40)
    renderSessionSwitch({
      sessions: [
        {
          viewPort: 7327,
          sessionId: "s-long",
          lastModified: LATER.epochMilliseconds,
          heading: longHeading,
        },
      ],
      session: identifiedSession("s-long"),
    })

    const label = options(screen.getByLabelText("セッション"))[0] ?? ""
    expect(label.endsWith(`${localLabel(LATER)}（表示中）`)).toBe(true)
    expect(label).not.toContain(longHeading)
    expect(label).toContain("…")
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
