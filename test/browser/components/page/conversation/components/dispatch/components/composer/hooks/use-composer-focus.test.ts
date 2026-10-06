import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { useComposerFocusTiming } from "../../../../../../../../../../src/browser/components/page/conversation/components/dispatch/components/composer/hooks/use-composer-focus.ts"
import type { ComposerSurface } from "../../../../../../../../../../src/browser/components/page/conversation/components/dispatch/domain/composer-surface.ts"
import { acquireOverlay } from "../../../../../../../../../../src/browser/hooks/open-overlay.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../../../../../../src/shared/session/session-state.ts"
import { putSession, putState } from "../../../../../../../../session-store.ts"

const RUNNING = { kind: "running", startedAt: 0 } as const satisfies SessionState["turn"]
const ENDED = {
  kind: "finished",
  startedAt: 0,
  finishedAt: 100,
  ending: { kind: "ended" },
} as const satisfies SessionState["turn"]

let releases: (() => void)[] = []

afterEach(() => {
  cleanup()
  for (const release of releases) {
    release()
  }
  releases = []
  document.body.innerHTML = ""
})

/** 動いているやり取りで入力欄のフォーカスの時機を回し、入力欄の面が受けたフォーカスの回数を返す口を渡す。 */
function renderWhileRunning(): () => number {
  let focused = 0
  const surface: ComposerSurface = {
    focus: () => {
      focused += 1
    },
    caret: () => 0,
    placeCaret: () => {},
  }
  putSession({ ...INITIAL_SESSION_STATE, turn: RUNNING })
  renderHook(() => {
    useComposerFocusTiming({ current: surface })
  })
  return () => focused
}

function close(): void {
  act(() => {
    putState({ ...INITIAL_SESSION_STATE, turn: ENDED })
  })
}

describe("useComposerFocusTiming（やり取りが閉じたとき）", () => {
  it("フォーカスがメインビューの外にあれば、入力欄へ入れる", () => {
    const focusedCount = renderWhileRunning()
    const outside = document.createElement("button")
    document.body.append(outside)
    outside.focus()

    close()

    expect(focusedCount()).toBe(1)
  })

  it("重なる面（セリフのログなど）が開いていれば、入力欄へ移さない", () => {
    const focusedCount = renderWhileRunning()
    releases = [acquireOverlay()]

    close()

    expect(focusedCount()).toBe(0)
  })
})
