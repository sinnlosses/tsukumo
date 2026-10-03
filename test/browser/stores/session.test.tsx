// 姿の store（`useSession` のセレクタ）の購読の粒度を見る。読んでいる値が
// 動かないフレームで部品が描き直されないことは、目で見ても分からないのでここで押さえる。
//

import { act, cleanup, render, screen } from "@testing-library/react"
import { Profiler, type ReactElement } from "react"
import { afterEach, describe, expect, it } from "vitest"

import { Inquiry } from "../../../src/browser/components/page/conversation/components/main-view/components/inquiry/inquiry.tsx"
import { useSession } from "../../../src/browser/stores/session.ts"
import { PROTOCOL_VERSION } from "../../../src/shared/frame.ts"
import type { StampedPendingAsk } from "../../../src/shared/session-driver/pending-ask.ts"
import { INITIAL_SESSION_STATE } from "../../../src/shared/session/session-state.ts"
import { putSession } from "../session-store.ts"

const FIXTURE_PERMISSION: StampedPendingAsk = {
  kind: "permission",
  id: "ask-1",
  toolName: "Read",
  input: {},
  askedAt: 0,
}

afterEach(() => {
  cleanup()
})

/** 姿のうち記録の件数だけを読む見張り。描き直されたことが字で分かるようにしてある。 */
function RecordCount(): ReactElement {
  const count = useSession((session) => session.state.records.length)
  return <p>{`記録${String(count)}件`}</p>
}

/** 許可要求1件を出したうえで、`<Inquiry>` が描き直された回数を数える。 */
function renderInquiry(countCommit: () => void): void {
  render(
    <>
      <Profiler id="inquiry" onRender={countCommit}>
        <Inquiry />
      </Profiler>
      <RecordCount />
    </>,
  )
}

describe("姿の store の購読", () => {
  it("答え待ちが動かないフレームでは、答え待ちしか読まないお伺いの札を描き直さない", () => {
    let commits = 0
    putSession({ ...INITIAL_SESSION_STATE, pending: [FIXTURE_PERMISSION] })
    renderInquiry(() => {
      commits += 1
    })

    // 数えられていること自体を先に確かめる（0 のままだと、この検査は何も試さなくなる）。
    expect(screen.getByRole("region", { name: "お伺い" })).toBeDefined()
    expect(commits).toBeGreaterThan(0)
    const afterFirstRender = commits

    act(() => {
      useSession.getState().receive({
        type: "events",
        events: [{ at: 0, event: { kind: "request", text: "架空の依頼", images: [] } }],
      })
    })

    // 姿は確かに動いた（記録が1件増えた）が、お伺いの札は描き直していない。
    expect(screen.getByText("記録1件")).toBeDefined()
    expect(commits).toBe(afterFirstRender)
  })

  it("答え待ちが動いたフレームでは描き直す", () => {
    let commits = 0
    putSession({ ...INITIAL_SESSION_STATE, pending: [FIXTURE_PERMISSION] })
    renderInquiry(() => {
      commits += 1
    })
    const afterFirstRender = commits

    act(() => {
      useSession.getState().receive({
        type: "events",
        events: [{ at: 0, event: { kind: "pending-changed", pending: [] } }],
      })
    })

    expect(screen.queryByRole("region", { name: "お伺い" })).toBeNull()
    expect(commits).toBeGreaterThan(afterFirstRender)
  })

  it("コマンドを送る口は、フレームが届いても同じ関数のまま", () => {
    putSession(INITIAL_SESSION_STATE)
    const dispatch = useSession.getState().dispatch

    act(() => {
      useSession.getState().receive({
        type: "events",
        events: [{ at: 0, event: { kind: "request", text: "架空の依頼", images: [] } }],
      })
    })

    expect(useSession.getState().dispatch).toBe(dispatch)
  })

  it("姿が変わらないフレーム（空の `events`）では、購読している部品に知らせない", () => {
    let commits = 0
    putSession({ ...INITIAL_SESSION_STATE, pending: [FIXTURE_PERMISSION] })
    renderInquiry(() => {
      commits += 1
    })
    const afterFirstRender = commits

    act(() => {
      useSession.getState().receive({ type: "events", events: [] })
    })

    expect(commits).toBe(afterFirstRender)
  })
})

describe("`hello` を受けた回数", () => {
  it("`hello` で増え、`events` では増えない", () => {
    putSession(INITIAL_SESSION_STATE)
    const afterHello = useSession.getState().generation
    expect(afterHello).toBeGreaterThan(0)

    act(() => {
      useSession.getState().receive({
        type: "events",
        events: [{ at: 0, event: { kind: "request", text: "架空の依頼", images: [] } }],
      })
    })
    expect(useSession.getState().generation).toBe(afterHello)

    act(() => {
      useSession.getState().receive({
        type: "hello",
        protocolVersion: PROTOCOL_VERSION,
        state: INITIAL_SESSION_STATE,
      })
    })
    expect(useSession.getState().generation).toBe(afterHello + 1)
  })
})

describe("サーバと版が合わないとき（docs/architecture.md「ServerFrame」）", () => {
  const REQUEST_EVENTS = {
    type: "events",
    events: [{ at: 0, event: { kind: "request", text: "架空の依頼", images: [] } }],
  } as const

  it("`hello` の版が違えば `mismatched` になり、そのあとの `events` を畳まない", () => {
    putSession(INITIAL_SESSION_STATE)

    useSession.getState().receive({
      type: "hello",
      protocolVersion: PROTOCOL_VERSION - 1,
      state: INITIAL_SESSION_STATE,
    })
    useSession.getState().receive(REQUEST_EVENTS)

    expect(useSession.getState().protocol).toBe("mismatched")
    expect(useSession.getState().state.records).toHaveLength(0)
  })

  it("版の合う `hello` がまた届けば `compatible` に戻り、その姿を使う", () => {
    putSession(INITIAL_SESSION_STATE)
    useSession.getState().receive({
      type: "hello",
      protocolVersion: PROTOCOL_VERSION - 1,
      state: INITIAL_SESSION_STATE,
    })

    useSession.getState().receive({
      type: "hello",
      protocolVersion: PROTOCOL_VERSION,
      state: INITIAL_SESSION_STATE,
    })
    useSession.getState().receive(REQUEST_EVENTS)

    expect(useSession.getState().protocol).toBe("compatible")
    expect(useSession.getState().state.records).toHaveLength(1)
  })
})
