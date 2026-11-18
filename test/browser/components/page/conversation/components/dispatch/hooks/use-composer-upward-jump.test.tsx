import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { ComposerKey } from "../../../../../../../../src/browser/components/page/conversation/components/dispatch/domain/composer-surface.ts"
import { useComposer } from "../../../../../../../../src/browser/components/page/conversation/components/dispatch/hooks/use-composer.ts"
import { useComposerDraft } from "../../../../../../../../src/browser/components/page/conversation/stores/composer-draft.ts"
import { useFavorVisibility } from "../../../../../../../../src/browser/components/page/conversation/stores/favor-visibility.ts"
import { useNextStepTray } from "../../../../../../../../src/browser/components/page/conversation/stores/next-step-tray.ts"
import type { NextStep } from "../../../../../../../../src/browser/features/report/domain/next-step-plan.ts"
import { useInquiryJump } from "../../../../../../../../src/browser/stores/inquiry-jump.ts"
import type { StampedPendingAsk } from "../../../../../../../../src/shared/session-driver/pending-ask.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../../../../src/shared/session/session-state.ts"
import { queryClientWrapper } from "../../../../../../query-client.tsx"
import { putSession } from "../../../../../../session-store.ts"

/** 入力欄が空のときの ↑ で、待っている用件（お伺い・お願い）へ移る規則だけを測る。 */

const PERMISSION_PENDING = {
  kind: "permission",
  id: "ask-1",
  toolName: "Bash",
  input: {},
  askedAt: 0,
} satisfies StampedPendingAsk

type Rendered = { readonly current: ReturnType<typeof useComposer> }
type PressedKey = ComposerKey & { readonly prevented: () => boolean }

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

function reset(): void {
  useNextStepTray.setState(useNextStepTray.getInitialState(), true)
  useFavorVisibility.setState(useFavorVisibility.getInitialState(), true)
  useInquiryJump.setState(useInquiryJump.getInitialState(), true)
  useComposerDraft.setState(useComposerDraft.getInitialState(), true)
}

beforeEach(reset)
afterEach(() => {
  cleanup()
  reset()
  document.body.replaceChildren()
})

function renderUseComposer(stateOverrides: Partial<SessionState> = {}): Rendered {
  putSession({ ...INITIAL_SESSION_STATE, ...stateOverrides })
  return renderHook(() => useComposer(), { wrapper: queryClientWrapper() }).result
}

function key(
  value: string,
  modifiers: { readonly ctrl?: boolean; readonly meta?: boolean; readonly shift?: boolean } = {},
): PressedKey {
  let prevented = false
  return {
    key: value,
    ctrlKey: modifiers.ctrl ?? false,
    metaKey: modifiers.meta ?? false,
    shiftKey: modifiers.shift ?? false,
    keyCode: 0,
    isComposing: false,
    preventDefault: () => {
      prevented = true
    },
    prevented: () => prevented,
  }
}

function press(result: Rendered, pressed: PressedKey): PressedKey {
  act(() => {
    result.current.input.onKeyDown(pressed)
  })
  return pressed
}

describe("useComposer の ↑ で用件へ移る", () => {
  it("お伺いを待っていて入力欄が空なら、お伺いの最初の選択肢へフォーカスを移して処理済みにする", () => {
    const result = renderUseComposer({ pending: [PERMISSION_PENDING] })

    const pressed = key("ArrowUp")
    act(() => {
      expect(result.current.input.onKeyDown(pressed)).toBe(true)
    })

    expect(pressed.prevented()).toBe(true)
    expect(useInquiryJump.getState().jump).toEqual({ signal: 1, focus: true })
  })

  it("字があるときの ↑ は処理せず、カーソルの移動のまま", () => {
    const result = renderUseComposer({ pending: [PERMISSION_PENDING] })
    act(() => {
      result.current.input.onChange({ text: "架空の依頼", caret: 5 })
    })

    const pressed = press(result, key("ArrowUp"))

    expect(pressed.prevented()).toBe(false)
    expect(useInquiryJump.getState().jump.signal).toBe(0)
  })

  it("修飾キー付き・変換中の ↑ と、待っている用件が無いときの ↑ は処理しない", () => {
    const waiting = renderUseComposer({ pending: [PERMISSION_PENDING] })
    press(waiting, key("ArrowUp", { meta: true }))
    press(waiting, key("ArrowUp", { shift: true }))
    press(waiting, key("ArrowUp", { ctrl: true }))
    press(waiting, { ...key("ArrowUp"), isComposing: true })
    cleanup()
    const idle = renderUseComposer()
    const pressed = press(idle, key("ArrowUp"))

    expect(pressed.prevented()).toBe(false)
    expect(useInquiryJump.getState().jump.signal).toBe(0)
  })

  it("お願いを待っていて入力欄が空なら、お願いの最初の口へフォーカスを移す。見えているときも効く", () => {
    const result = renderUseComposer()
    const favor = document.createElement("div")
    favor.id = "favor-a"
    favor.scrollIntoView = () => {}
    const first = document.createElement("button")
    favor.append(first, document.createElement("button"))
    document.body.append(favor)
    act(() => {
      useFavorVisibility.getState().attach("favor-a")
      useFavorVisibility.getState().setVisible(true)
    })

    const pressed = press(result, key("ArrowUp"))

    expect(pressed.prevented()).toBe(true)
    expect(document.activeElement).toBe(first)
  })

  it("お伺いとお願いが並ぶときは、お伺いを先に受ける", () => {
    const result = renderUseComposer({ pending: [PERMISSION_PENDING] })
    act(() => {
      useFavorVisibility.getState().attach("favor-a")
    })

    press(result, key("ArrowUp"))

    expect(useInquiryJump.getState().jump).toEqual({ signal: 1, focus: true })
  })

  function placeTrayAndFavor(): { readonly chip: HTMLElement; readonly favorAction: HTMLElement } {
    const tray = document.createElement("div")
    tray.id = "next-step-tray"
    const chip = document.createElement("button")
    chip.setAttribute("data-next-step-chip", "")
    tray.append(chip)
    const favor = document.createElement("div")
    favor.id = "favor-a"
    favor.scrollIntoView = () => {}
    const favorAction = document.createElement("button")
    favor.append(favorAction)
    document.body.append(tray, favor)
    act(() => {
      useNextStepTray.getState().attach("1:0", STEPS)
      useFavorVisibility.getState().attach("favor-a")
    })
    return { chip, favorAction }
  }

  it("↑ は お伺い → 次の一手の並びの先頭の札 → お願い の順に、最初にあるものへ移る", () => {
    const withInquiry = renderUseComposer({ pending: [PERMISSION_PENDING] })
    const { chip } = placeTrayAndFavor()
    press(withInquiry, key("ArrowUp"))
    expect(useInquiryJump.getState().jump).toEqual({ signal: 1, focus: true })
    cleanup()

    const result = renderUseComposer()
    press(result, key("ArrowUp"))

    expect(document.activeElement).toBe(chip)
  })

  it("並びを畳んでいるときの ↑ は並びを飛ばしてお願いへ移る", () => {
    const result = renderUseComposer()
    const { favorAction } = placeTrayAndFavor()
    act(() => {
      useNextStepTray.getState().fold()
    })

    press(result, key("ArrowUp"))

    expect(document.activeElement).toBe(favorAction)
  })

  it("依頼を送って外したお願いへは移らない", () => {
    const result = renderUseComposer()
    act(() => {
      useFavorVisibility.getState().attach("favor-a")
      useFavorVisibility.getState().dismiss()
    })

    const pressed = press(result, key("ArrowUp"))

    expect(pressed.prevented()).toBe(false)
  })
})
