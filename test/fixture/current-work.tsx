// 「いまの作業」の一覧と開閉のテストが共有する、器の差し込みと開くボタンの取り出し。
// 本番では狭い画面の頭が `useCurrentWork` と `CurrentWorkList` を使う。ここでは同じフックと一覧を最小の器に載せる。

import { render } from "@testing-library/react"
import { useId, useRef, type ReactElement } from "react"

import { CurrentWorkList } from "../../src/browser/features/current-work/current-work-list.tsx"
import { useCurrentWork } from "../../src/browser/features/current-work/use-current-work.ts"
import { INITIAL_SESSION_STATE, type SessionState } from "../../src/shared/session/session-state.ts"
import { queryClientWrapper } from "../browser/query-client.tsx"
import { putSession } from "../browser/session-store.ts"
import { typedElement } from "../typed-element.ts"

function CurrentWorkHarness(): ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  const work = useCurrentWork(ref)
  const { toggleRef } = work
  const listId = useId()

  return (
    <div ref={ref} data-testid="current-work-harness">
      <button
        type="button"
        ref={toggleRef}
        className="current-work-toggle"
        aria-expanded={work.open}
        aria-controls={listId}
        onClick={work.onToggle}
      >
        <span className="current-work-word">{work.wordLabel}</span>
        {work.summary.kind === "text" && (
          <span className="current-work-summary">{work.summary.label}</span>
        )}
      </button>
      {work.open && <CurrentWorkList id={listId} work={work} className="" />}
    </div>
  )
}

/** 一覧を開く器を描く。画面を自分で決めたいテストは、呼ぶ前に hash を書く。 */
export function renderCurrentWork(state: Partial<SessionState> = {}): void {
  if (window.location.hash === "") {
    window.location.hash = "#character"
  }
  putSession({ ...INITIAL_SESSION_STATE, ...state })
  render(<CurrentWorkHarness />, { wrapper: queryClientWrapper() })
}

/** 器の中の、一覧を開くボタン。 */
export function workToggle(): HTMLElement {
  return typedElement(
    document.querySelector("[data-testid='current-work-harness'] .current-work-toggle"),
    HTMLElement,
    "いまの作業の一覧を開くボタン",
  )
}
