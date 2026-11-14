import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import type { ComposerSurface } from "../../../../../../../../src/browser/components/page/conversation/components/dispatch/domain/composer-surface.ts"
import { useComposerFocusTiming } from "../../../../../../../../src/browser/components/page/conversation/components/dispatch/hooks/use-composer-focus.ts"
import { acquireOverlay } from "../../../../../../../../src/browser/hooks/open-overlay.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../../../../src/shared/session/session-state.ts"
import { putSession, putState } from "../../../../../../session-store.ts"

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

/** 動いているやり取りで入力欄のフォーカスの時機を回し、入力欄のサーフェスが受けたフォーカスの回数を返す口を渡す。 */
function renderWhileRunning(): () => number {
  let focused = 0
  const surface: ComposerSurface = {
    focus: () => {
      focused += 1
    },
    caret: () => 0,
    replace: () => {},
    blur: () => {},
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

function pressSlash(init: KeyboardEventInit = {}, target: EventTarget = document.body): boolean {
  const event = new KeyboardEvent("keydown", { key: "/", bubbles: true, cancelable: true, ...init })
  act(() => {
    target.dispatchEvent(event)
  })
  return event.defaultPrevented
}

describe("useComposerFocusTiming（/ で入力欄へ移る）", () => {
  it("入力要素の外で / を押すと、面にフォーカスを1回入れ、字は入れない", () => {
    const focusedCount = renderWhileRunning()

    expect(pressSlash()).toBe(true)

    expect(focusedCount()).toBe(1)
  })

  it("入力要素の中では何もしない", () => {
    const focusedCount = renderWhileRunning()
    const field = document.createElement("textarea")
    document.body.append(field)

    expect(pressSlash({}, field)).toBe(false)

    expect(focusedCount()).toBe(0)
  })

  it("変換中・修飾キー付きでは何もしない", () => {
    const focusedCount = renderWhileRunning()

    pressSlash({ isComposing: true })
    pressSlash({ metaKey: true })
    pressSlash({ ctrlKey: true })
    pressSlash({ altKey: true })

    expect(focusedCount()).toBe(0)
  })

  it("重なる面が開いているあいだは何もしない", () => {
    const focusedCount = renderWhileRunning()
    releases = [acquireOverlay()]

    pressSlash()

    expect(focusedCount()).toBe(0)
  })
})

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
