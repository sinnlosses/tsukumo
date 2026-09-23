// 姿の store（`useSyncExternalStore` + セレクタ）の**購読の粒度**を見る。読んでいる値が
// 動かないフレームで部品が描き直されないことは、目で見ても分からないのでここで押さえる。
//
// フィクスチャはすべて手で書いた架空の依頼・許可要求（docs/coding-standards.md「会話内容の扱い」）。

import { afterEach, describe, expect, it } from "bun:test"

import { act, cleanup, render, screen } from "@testing-library/react"
import { Profiler, type ReactElement } from "react"

import { PendingAnswer } from "../../../src/browser/features/dispatch/pending-answer.tsx"
import {
  SessionStoreContext,
  useSessionSelector,
  type SessionStore,
} from "../../../src/browser/stores/session.tsx"
import { PROTOCOL_VERSION } from "../../../src/shared/frame.ts"
import { type PendingAsk } from "../../../src/shared/pending-ask.ts"
import { INITIAL_SESSION_STATE } from "../../../src/shared/session-state.ts"
import { sessionStoreWith } from "../session-store.ts"

const FIXTURE_PERMISSION: PendingAsk = {
  kind: "permission",
  id: "ask-1",
  toolName: "Read",
  input: {},
}

afterEach(() => {
  cleanup()
})

/** 姿のうち記録の件数だけを読む見張り。**描き直されたことが字で分かる**ようにしてある。 */
function RecordCount(): ReactElement {
  const count = useSessionSelector((session) => session.state.records.length)
  return <p>{`記録${String(count)}件`}</p>
}

/** 許可要求1件を出したうえで、`<PendingAnswer>` が描き直された回数を数える。 */
function renderPendingAnswer(store: SessionStore, countCommit: () => void): void {
  render(
    <SessionStoreContext.Provider value={store}>
      <Profiler id="pending-answer" onRender={countCommit}>
        <PendingAnswer />
      </Profiler>
      <RecordCount />
    </SessionStoreContext.Provider>,
  )
}

describe("姿の store の購読", () => {
  it("答え待ちが動かないフレームでは、`dispatch` しか使わない答えの箱を描き直さない", () => {
    let commits = 0
    const store = sessionStoreWith({ ...INITIAL_SESSION_STATE, pending: [FIXTURE_PERMISSION] })
    renderPendingAnswer(store, () => {
      commits += 1
    })

    // 数えられていること自体を先に確かめる（0 のままだと、この検査は何も試さなくなる）。
    expect(screen.getByText("許可")).toBeDefined()
    expect(commits).toBeGreaterThan(0)
    const afterFirstRender = commits

    act(() => {
      store.receive({
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
    const store = sessionStoreWith({ ...INITIAL_SESSION_STATE, pending: [FIXTURE_PERMISSION] })
    renderPendingAnswer(store, () => {
      commits += 1
    })
    const afterFirstRender = commits

    act(() => {
      store.receive({
        type: "events",
        events: [{ at: 0, event: { kind: "pending-changed", pending: [] } }],
      })
    })

    expect(screen.queryByText("許可")).toBeNull()
    expect(commits).toBeGreaterThan(afterFirstRender)
  })

  it("コマンドを送る口は、フレームが届いても同じ関数のまま", () => {
    const store = sessionStoreWith(INITIAL_SESSION_STATE)
    const dispatch = store.dispatch

    act(() => {
      store.receive({
        type: "events",
        events: [{ at: 0, event: { kind: "request", text: "架空の依頼", images: [] } }],
      })
    })

    expect(store.dispatch).toBe(dispatch)
  })

  it("姿が変わらないフレーム（`error`）では、購読している部品に知らせない", () => {
    let commits = 0
    const store = sessionStoreWith({ ...INITIAL_SESSION_STATE, pending: [FIXTURE_PERMISSION] })
    renderPendingAnswer(store, () => {
      commits += 1
    })
    const afterFirstRender = commits

    act(() => {
      store.receive({ type: "error", commandId: undefined, reason: "架空の理由" })
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
    const store = sessionStoreWith(INITIAL_SESSION_STATE)

    store.receive({
      type: "hello",
      protocolVersion: PROTOCOL_VERSION - 1,
      state: INITIAL_SESSION_STATE,
    })
    store.receive(REQUEST_EVENTS)

    expect(store.getSnapshot().protocol).toBe("mismatched")
    expect(store.getSnapshot().state.records).toHaveLength(0)
  })

  it("版の合う `hello` がまた届けば `compatible` に戻り、その姿を使う", () => {
    const store = sessionStoreWith(INITIAL_SESSION_STATE)
    store.receive({
      type: "hello",
      protocolVersion: PROTOCOL_VERSION - 1,
      state: INITIAL_SESSION_STATE,
    })

    store.receive({
      type: "hello",
      protocolVersion: PROTOCOL_VERSION,
      state: INITIAL_SESSION_STATE,
    })
    store.receive(REQUEST_EVENTS)

    expect(store.getSnapshot().protocol).toBe("compatible")
    expect(store.getSnapshot().state.records).toHaveLength(1)
  })
})
