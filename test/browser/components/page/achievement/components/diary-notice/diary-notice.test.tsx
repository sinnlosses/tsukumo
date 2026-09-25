import { afterEach, describe, expect, it } from "bun:test"

import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react"

import { DiaryNotice } from "../../../../../../../src/browser/components/page/achievement/components/diary-notice/diary-notice.tsx"
import { useDiaryBookOpenRequest } from "../../../../../../../src/browser/components/page/achievement/hooks/use-diary-book-open-request.ts"
import {
  SessionStoreContext,
  type SessionStore,
} from "../../../../../../../src/browser/stores/session.tsx"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../../../src/shared/session-state.ts"
import { putState, sessionStoreWith } from "../../../../../session-store.ts"

/**
 * 書き終わりの知らせ（`docs/screen-design.md` 13.10「書き終わりの知らせ」）。フィクスチャの日付は
 * すべて架空（`docs/coding-standards.md`「会話内容の扱い」）。
 */

afterEach(() => {
  cleanup()
  window.location.hash = ""
})

function stateWith(patch: Partial<SessionState>): SessionState {
  return { ...INITIAL_SESSION_STATE, ...patch }
}

function renderNotice(store: SessionStore): ReturnType<typeof render> {
  return render(
    <SessionStoreContext.Provider value={store}>
      <DiaryNotice />
    </SessionStoreContext.Provider>,
  )
}

describe("DiaryNotice", () => {
  it("書いていない間は何も出さない", () => {
    renderNotice(sessionStoreWith(stateWith({ diaryWriting: { kind: "idle" } })))
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("書いている間は何も出さない", () => {
    renderNotice(
      sessionStoreWith(
        stateWith({
          diaryWriting: { kind: "writing", date: "2026-09-20", startedAt: 0, stage: "write" },
        }),
      ),
    )
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("書き上がったら日付と2つのボタンを出す", () => {
    renderNotice(
      sessionStoreWith(
        stateWith({ diaryWriting: { kind: "written", date: "2026-09-20", writtenAt: 1000 } }),
      ),
    )

    expect(screen.getByRole("status")).toBeDefined()
    expect(screen.getByText("9月20日のページができました")).toBeDefined()
    expect(screen.getByRole("button", { name: "日記帳で開く" })).toBeDefined()
    expect(screen.getByRole("button", { name: "知らせを消す" })).toBeDefined()
  })

  it("×を押すと消える", () => {
    renderNotice(
      sessionStoreWith(
        stateWith({ diaryWriting: { kind: "written", date: "2026-09-20", writtenAt: 1000 } }),
      ),
    )

    fireEvent.click(screen.getByRole("button", { name: "知らせを消す" }))

    expect(screen.queryByRole("status")).toBeNull()
  })

  it("「日記帳で開く」を押すと消え、その日へ遷移して見開きを開く合図を送る", () => {
    renderNotice(
      sessionStoreWith(
        stateWith({ diaryWriting: { kind: "written", date: "2026-09-20", writtenAt: 1000 } }),
      ),
    )

    fireEvent.click(screen.getByRole("button", { name: "日記帳で開く" }))

    expect(screen.queryByRole("status")).toBeNull()
    expect(window.location.hash).toBe("#achievement?date=2026-09-20")
    const { result } = renderHook(() => useDiaryBookOpenRequest())
    expect(result.current?.date).toBe("2026-09-20")
  })

  it("消したあとでも、別の日が書き上がれば出し直す", () => {
    const store = sessionStoreWith(
      stateWith({ diaryWriting: { kind: "written", date: "2026-09-20", writtenAt: 1000 } }),
    )
    renderNotice(store)
    fireEvent.click(screen.getByRole("button", { name: "知らせを消す" }))
    expect(screen.queryByRole("status")).toBeNull()

    act(() => {
      putState(
        store,
        stateWith({ diaryWriting: { kind: "written", date: "2026-09-21", writtenAt: 2000 } }),
      )
    })

    expect(screen.getByText("9月21日のページができました")).toBeDefined()
  })
})
