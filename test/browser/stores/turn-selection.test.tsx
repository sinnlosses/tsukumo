import { afterEach, describe, expect, it } from "bun:test"

import { act, cleanup, renderHook } from "@testing-library/react"
import { type ReactNode } from "react"

import { SessionStoreContext, type SessionStore } from "../../../src/browser/stores/session.tsx"
import {
  TurnSelectionProvider,
  useTurnSelection,
  type TurnSelectionValue,
} from "../../../src/browser/stores/turn-selection.tsx"
import { INITIAL_SESSION_STATE, type SessionRecord } from "../../../src/shared/session-state.ts"
import { putState, sessionStoreWith } from "../session-store.ts"

afterEach(() => {
  cleanup()
  window.location.hash = ""
})

/** 架空の依頼とレポートを `count` ターンぶん（通し番号は 0 から）。 */
function turns(count: number): readonly SessionRecord[] {
  return Array.from({ length: count }, (_, turnId): SessionRecord[] => [
    {
      kind: "request",
      turnId,
      text: `架空の依頼${String(turnId)}`,
      images: [],
      time: { kind: "stamped", at: 0 },
    },
    { kind: "detail", markdown: `架空のレポート${String(turnId)}` },
  ]).flat()
}

function renderSelection(records: readonly SessionRecord[]): {
  readonly store: SessionStore
  readonly current: () => TurnSelectionValue
} {
  const store = sessionStoreWith({ ...INITIAL_SESSION_STATE, records })
  const { result } = renderHook(() => useTurnSelection(), {
    wrapper: ({ children }: { readonly children: ReactNode }) => (
      <SessionStoreContext.Provider value={store}>
        <TurnSelectionProvider>{children}</TurnSelectionProvider>
      </SessionStoreContext.Provider>
    ),
  })
  return { store, current: () => result.current }
}

/** happy-dom は `hashchange` を次のタスクで出すので、ここで流して読み直させる。 */
function flushHashChange(): void {
  act(() => {
    window.dispatchEvent(new Event("hashchange"))
  })
}

describe("TurnSelectionProvider（hash → 選択）", () => {
  it("hash に turn が無ければ今回を見る", () => {
    const { current } = renderSelection(turns(3))

    expect(current().activeTurnId).toBe(2)
    expect(current().newestTurnId).toBe(2)
  })

  it("hash の turn が指すターンを見る（リロードしても同じターンに戻る）", () => {
    window.location.hash = "#?turn=1"

    const { current } = renderSelection(turns(3))

    expect(current().activeTurnId).toBe(1)
  })

  it("hash が変わると読み直す（ブラウザの「戻る」）", () => {
    window.location.hash = "#?turn=0"
    const { current } = renderSelection(turns(3))

    window.location.hash = "#?turn=1"
    flushHashChange()

    expect(current().activeTurnId).toBe(1)
  })

  it("hash が指すターンが窓に無ければ今回を見る", () => {
    window.location.hash = "#?turn=42"

    const { current } = renderSelection(turns(3))

    expect(current().activeTurnId).toBe(2)
  })

  it("留めたターンは新しいターンが来ても動かず、追従中なら新しいターンへ移る", () => {
    const { store, current } = renderSelection(turns(3))
    act(() => {
      putState(store, { ...INITIAL_SESSION_STATE, records: turns(4) })
    })
    expect(current().activeTurnId).toBe(3)

    window.location.hash = "#?turn=1"
    flushHashChange()
    act(() => {
      putState(store, { ...INITIAL_SESSION_STATE, records: turns(5) })
    })
    expect(current().activeTurnId).toBe(1)
  })
})

describe("TurnSelectionProvider（選択 → hash）", () => {
  it("過去のターンを選ぶと hash に乗り、今回を選ぶと外れる", () => {
    const { current } = renderSelection(turns(3))

    act(() => {
      current().selectTurn(0)
    })
    expect(window.location.hash).toBe("#?turn=0")

    flushHashChange()
    act(() => {
      current().selectTurn(2)
    })
    expect(window.location.hash).toBe("")
  })

  it("画面の部分は消さない", () => {
    window.location.hash = "#character"
    const { current } = renderSelection(turns(3))

    act(() => {
      current().selectTurn(1)
    })

    expect(window.location.hash).toBe("#character?turn=1")
  })
})
