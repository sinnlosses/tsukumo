import { QueryClientProvider } from "@tanstack/react-query"
import { act, fireEvent, render, screen, type RenderResult } from "@testing-library/react"

import { MainView } from "../../src/browser/components/page/conversation/components/main-view/main-view.tsx"
import type { SessionRecord } from "../../src/shared/session/session-record.ts"
import { INITIAL_SESSION_STATE, type SessionState } from "../../src/shared/session/session-state.ts"
import { createTestQueryClient } from "../browser/query-client.tsx"
import { putSession, putState } from "../browser/session-store.ts"
import { detailRecord, requestRecord } from "./session-record.ts"

export const OUTLINE_PANEL_STORAGE_KEY = "tsukumo-outline-panel:v1"

/** `turn` を渡すと、そのターンの進み具合で描く（既定は動いていない）。`pending` は答え待ちの列。 */
export function renderMainView(
  records: readonly SessionRecord[],
  turn: SessionState["turn"] = INITIAL_SESSION_STATE.turn,
  pending: SessionState["pending"] = INITIAL_SESSION_STATE.pending,
): RenderResult {
  // 動いているターンを渡したときは、記録の本文がいまの SDK ターンで届いたものとして扱う
  // （前の SDK ターンで確定した本文は、動いているあいだも出したままになるため）。
  const bodiesInTurn =
    turn.kind === "running" ? { report: true, utterance: true } : INITIAL_SESSION_STATE.bodiesInTurn
  putSession({ ...INITIAL_SESSION_STATE, records, turn, bodiesInTurn, pending })
  // `MainView` は `<RepositoryFileLinkProvider>`（レポートのパスを押せる部品にする一覧の取得）を
  // 内側で mount するので `useQuery` が要る。ここでは一覧の中身を見ないので、フェッチそのものは
  // 差し替えない（`window.fetch` は happy-dom の対象外なので落ちるだけで、テストは待たない）。
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MainView />
    </QueryClientProvider>,
  )
}

/**
 * 名前でボタンを押す。選択は hash に乗り、happy-dom は `hashchange` を次のタスクで出すので
 * （本物のブラウザも同期では出さない）、ここで流して読み直させる。
 */
export function press(name: string): void {
  act(() => {
    fireEvent.click(screen.getByRole("button", { name }))
    window.dispatchEvent(new Event("hashchange"))
  })
}

export function rerenderMainView(records: readonly SessionRecord[]): void {
  act(() => {
    putState({ ...INITIAL_SESSION_STATE, records })
  })
}

/**
 * メインビューの根で `[`（1つ古い）か `]`（1つ新しい）を押す。
 * 選択は hash に乗るので、`press` と同じく `hashchange` を流す。
 */
export function stepTurn(key: "[" | "]", init: KeyboardEventInit = {}): void {
  const root = document.querySelector("[data-main-view]")
  if (root === null) {
    throw new Error("メインビューの根が見つからない")
  }
  act(() => {
    fireEvent.keyDown(root, { key, ...init })
    window.dispatchEvent(new Event("hashchange"))
  })
}

export function threeTurns(): readonly SessionRecord[] {
  return [
    requestRecord({ text: "1つ目", turnId: 0 }),
    detailRecord("1つ目のレポート"),
    requestRecord({ text: "2つ目", turnId: 1 }),
    detailRecord("2つ目のレポート"),
    requestRecord({ text: "3つ目", turnId: 2 }),
    detailRecord("3つ目のレポート"),
  ]
}

/** 見ているターンの依頼の1行目（依頼の全文の最初の行）。 */
export function title(): string | null | undefined {
  return screen
    .getByRole("heading", { level: 2, name: "依頼" })
    .closest("section")
    ?.querySelector("p > span")?.textContent
}

/** やり取りの列を開いたと選んだ状態にする（happy-dom では札の幅が 0 で、選ばなければ畳まれる）。 */
export function chooseOutlineOpen(): void {
  localStorage.setItem(OUTLINE_PANEL_STORAGE_KEY, JSON.stringify({ collapse: "open" }))
}
