import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { ComposerKey } from "../../../../../../../../src/browser/components/page/conversation/components/dispatch/domain/composer-surface.ts"
import { useComposer } from "../../../../../../../../src/browser/components/page/conversation/components/dispatch/hooks/use-composer.ts"
import { useComposerDraft } from "../../../../../../../../src/browser/components/page/conversation/stores/composer-draft.ts"
import { useFavorVisibility } from "../../../../../../../../src/browser/components/page/conversation/stores/favor-visibility.ts"
import { useNextStepTray } from "../../../../../../../../src/browser/components/page/conversation/stores/next-step-tray.ts"
import type { NextStep } from "../../../../../../../../src/browser/features/report/domain/next-step-plan.ts"
import { useSession } from "../../../../../../../../src/browser/stores/session.ts"
import type { StampedPendingAsk } from "../../../../../../../../src/shared/session-driver/pending-ask.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../../../../src/shared/session/session-state.ts"
import { queryClientWrapper } from "../../../../../../query-client.tsx"
import { putSession } from "../../../../../../session-store.ts"

/**
 * `<Composer>` を描かずに、入力欄の上の帯の出し分けだけを測る。
 * フィクスチャはすべて手で書いた架空のもの
 */

beforeEach(() => {
  useFavorVisibility.setState(useFavorVisibility.getInitialState(), true)
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  useComposerDraft.setState(useComposerDraft.getInitialState(), true)
  useFavorVisibility.setState(useFavorVisibility.getInitialState(), true)
  useNextStepTray.setState(useNextStepTray.getInitialState(), true)
})

const STEPS: readonly NextStep[] = [
  {
    kind: "resume",
    kindLabel: "再開する",
    label: "架空の再開",
    note: "",
    draft: "架空の再開",
    points: 0,
  },
]

function renderUseComposer(stateOverrides: Partial<SessionState> = {}): {
  readonly result: { readonly current: ReturnType<typeof useComposer> }
} {
  putSession({ ...INITIAL_SESSION_STATE, ...stateOverrides }, () => {})
  const { result } = renderHook(() => useComposer(), { wrapper: queryClientWrapper() })
  return { result }
}

function type(result: { readonly current: ReturnType<typeof useComposer> }, value: string): void {
  act(() => {
    result.current.input.onChange({ text: value, caret: value.length })
  })
}

function pressSendKey(result: { readonly current: ReturnType<typeof useComposer> }): void {
  const pressed: ComposerKey = {
    key: "Enter",
    ctrlKey: false,
    metaKey: true,
    shiftKey: false,
    keyCode: 0,
    isComposing: false,
    preventDefault: () => {},
  }
  act(() => {
    result.current.input.onKeyDown(pressed)
  })
}

describe("useComposer のお願いの帯", () => {
  it("お願いがあり見えていないと favor、見えると none", () => {
    const { result } = renderUseComposer()
    expect(result.current.band.kind).toBe("none")

    act(() => {
      useFavorVisibility.getState().attach("favor-a")
    })
    expect(result.current.band.kind).toBe("favor")

    act(() => {
      useFavorVisibility.getState().setVisible(true)
    })
    expect(result.current.band.kind).toBe("none")
  })

  it("切断の帯はお願いの帯より先に出す", () => {
    const { result } = renderUseComposer()
    act(() => {
      useFavorVisibility.getState().attach("favor-a")
      useSession.getState().setConnection("closed")
    })
    act(() => {
      useSession.getState().setConnection("connecting")
    })

    expect(result.current.band.kind).toBe("disconnected")
  })

  it("依頼を送ると none になる", () => {
    const { result } = renderUseComposer()
    act(() => {
      useFavorVisibility.getState().attach("favor-a")
    })
    type(result, "架空の依頼")

    pressSendKey(result)

    expect(result.current.band.kind).toBe("none")
  })

  it("依頼を送ると次の一手の並びが消える", () => {
    const { result } = renderUseComposer()
    act(() => {
      useNextStepTray.getState().attach("1:0", STEPS)
    })
    expect(result.current.tray.kind).toBe("shown")
    type(result, "架空の依頼")

    pressSendKey(result)

    expect(result.current.tray.kind).toBe("none")
  })

  it("onJump は欄を見える範囲へ送る", () => {
    const { result } = renderUseComposer()
    act(() => {
      useFavorVisibility.getState().attach("favor-a")
    })
    const target = document.createElement("div")
    target.id = "favor-a"
    const scrolled: (boolean | ScrollIntoViewOptions | undefined)[] = []
    target.scrollIntoView = (options) => {
      scrolled.push(options)
    }
    document.body.append(target)

    const band = result.current.band
    if (band.kind !== "favor") {
      throw new Error("favor の帯が出ていない")
    }
    band.onJump()
    target.remove()

    expect(scrolled).toEqual([{ block: "start" }])
  })
})

describe("useComposer の帯と次の一手の並び", () => {
  const PERMISSION_PENDING = {
    kind: "permission",
    id: "ask-1",
    toolName: "Bash",
    input: {},
    askedAt: 0,
  } satisfies StampedPendingAsk

  function attachTray(): void {
    act(() => {
      useNextStepTray.getState().attach("1:0", STEPS)
    })
  }

  it("切断・終了・/clear の止め・お伺いの帯が出ているあいだは並びが出ない", () => {
    attachTray()
    const seen: (readonly [string, string])[] = []
    const record = (result: { readonly current: ReturnType<typeof useComposer> }): void => {
      seen.push([result.current.band.kind, result.current.tray.kind])
      cleanup()
    }

    const disconnected = renderUseComposer()
    act(() => {
      useSession.getState().setConnection("closed")
    })
    act(() => {
      useSession.getState().setConnection("connecting")
    })
    record(disconnected.result)
    record(renderUseComposer({ endedReason: "架空の理由" }).result)
    record(renderUseComposer({ pending: [PERMISSION_PENDING] }).result)
    const cleared = renderUseComposer()
    type(cleared.result, "/clear 架空の続き")
    pressSendKey(cleared.result)
    record(cleared.result)

    expect(seen).toEqual([
      ["disconnected", "none"],
      ["ended", "none"],
      ["inquiry", "none"],
      ["clear-dropped", "none"],
    ])
  })

  it("並びがあるあいだ、お願いは帯でなく並びの見出しに出る。並びが無ければ帯に出る", () => {
    const { result } = renderUseComposer()
    act(() => {
      useFavorVisibility.getState().attach("favor-a")
    })
    expect(result.current.band.kind).toBe("favor")

    attachTray()

    expect(result.current.band.kind).toBe("none")
    expect(result.current.tray).toMatchObject({ kind: "shown", favor: { kind: "waiting" } })
  })
})
