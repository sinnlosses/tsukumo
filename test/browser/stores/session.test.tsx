// 姿の store（`useSession` のセレクタ）の購読の粒度を見る。読んでいる値が
// 動かないフレームで部品が描き直されないことは、目で見ても分からないのでここで押さえる。
//
// フィクスチャはすべて手で書いた架空の依頼・許可要求（docs/coding-standards.md「会話内容の扱い」）。

import { act, cleanup, render, screen } from "@testing-library/react"
import { Profiler, type ReactElement } from "react"
import { afterEach, describe, expect, it } from "vitest"

import { PendingAnswer } from "../../../src/browser/components/page/conversation/components/dispatch/components/pending-answer/pending-answer.tsx"
import { useSession } from "../../../src/browser/stores/session.ts"
import { PROTOCOL_VERSION } from "../../../src/shared/frame.ts"
import type { PendingAsk } from "../../../src/shared/pending-ask.ts"
import { INITIAL_SESSION_STATE } from "../../../src/shared/session-state.ts"
import { putSession } from "../session-store.ts"

const FIXTURE_PERMISSION: PendingAsk = {
  kind: "permission",
  id: "ask-1",
  toolName: "Read",
  input: {},
}

afterEach(() => {
  cleanup()
})

/** 姿のうち記録の件数だけを読む見張り。描き直されたことが字で分かるようにしてある。 */
function RecordCount(): ReactElement {
  const count = useSession((session) => session.state.records.length)
  return <p>{`記録${String(count)}件`}</p>
}

/** 許可要求1件を出したうえで、`<PendingAnswer>` が描き直された回数を数える。 */
function renderPendingAnswer(countCommit: () => void): void {
  render(
    <>
      <Profiler id="pending-answer" onRender={countCommit}>
        <PendingAnswer />
      </Profiler>
      <RecordCount />
    </>,
  )
}

describe("姿の store の購読", () => {
  it("答え待ちが動かないフレームでは、`dispatch` しか使わない答えの箱を描き直さない", () => {
    let commits = 0
    putSession({ ...INITIAL_SESSION_STATE, pending: [FIXTURE_PERMISSION] })
    renderPendingAnswer(() => {
      commits += 1
    })

    // 数えられていること自体を先に確かめる（0 のままだと、この検査は何も試さなくなる）。
    expect(screen.getByText("許可")).toBeDefined()
    expect(commits).toBeGreaterThan(0)
    const afterFirstRender = commits

    act(() => {
      useSession.getState().receive({
        type: "events",
        events: [{ at: 0, event: { kind: "request", text: "架空の依頼", images: [] } }],
      })
    })

    // 姿は確かに動いた（記録が1件増えた）が、答えの箱は描き直していない。
    expect(screen.getByText("記録1件")).toBeDefined()
    expect(commits).toBe(afterFirstRender)
  })

  it("答え待ちが動いたフレームでは描き直す", () => {
    let commits = 0
    putSession({ ...INITIAL_SESSION_STATE, pending: [FIXTURE_PERMISSION] })
    renderPendingAnswer(() => {
      commits += 1
    })
    const afterFirstRender = commits

    act(() => {
      useSession.getState().receive({
        type: "events",
        events: [{ at: 0, event: { kind: "pending-changed", pending: [] } }],
      })
    })

    expect(screen.queryByText("許可")).toBeNull()
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
    renderPendingAnswer(() => {
      commits += 1
    })
    const afterFirstRender = commits

    act(() => {
      useSession.getState().receive({ type: "events", events: [] })
    })

    expect(commits).toBe(afterFirstRender)
  })
})

describe("サーバと版が合わないとき（docs/design.md 4.4）", () => {
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
