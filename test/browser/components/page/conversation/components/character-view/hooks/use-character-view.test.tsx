import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useCharacterView } from "../../../../../../../../src/browser/components/page/conversation/components/character-view/hooks/use-character-view.ts"
import { useSession } from "../../../../../../../../src/browser/stores/session.ts"
import { nowEpochMilliseconds } from "../../../../../../../../src/browser/utils/clock.ts"
import type { StampedPendingAsk } from "../../../../../../../../src/shared/session-driver/pending-ask.ts"
import { INITIAL_SESSION_STATE } from "../../../../../../../../src/shared/session/session-state.ts"
import { FIXTURE_CHARACTER, speech } from "../../../../../../../fixture/character-view.tsx"
import { stubPhoneWidth } from "../../../../../../phone-width.ts"
import { queryClientWrapper } from "../../../../../../query-client.tsx"
import { putSession, putState } from "../../../../../../session-store.ts"

afterEach(() => {
  cleanup()
})

describe("useCharacterView", () => {
  it("読む欄が同じで姿の参照だけが新しくなっても描き直さない", () => {
    const base = {
      ...INITIAL_SESSION_STATE,
      character: FIXTURE_CHARACTER,
      speeches: [speech("架空のセリフ")],
    }
    putSession(base)
    let renders = 0
    renderHook(
      () => {
        renders += 1
        return useCharacterView()
      },
      { wrapper: queryClientWrapper() },
    )
    const before = renders

    act(() => {
      putState({ ...base, sessionDefault: { ...base.sessionDefault } })
    })
    act(() => {
      putState({ ...base, sessionDefault: { ...base.sessionDefault } })
    })

    expect(renders).toBe(before)
  })
})

describe("useCharacterView の動き", () => {
  const BECKON_WINDOW_MS = 10_800

  function question(askedAt: number): StampedPendingAsk {
    return { kind: "permission", id: "ask-1", toolName: "Read", input: {}, askedAt }
  }

  function renderMotion(): { readonly current: () => string } {
    const view = renderHook(() => useCharacterView(), { wrapper: queryClientWrapper() })
    return { current: () => view.result.current.motion }
  }

  function setPageHidden(hidden: boolean): void {
    vi.spyOn(document, "hidden", "get").mockReturnValue(hidden)
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"))
    })
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("答え待ちが届いた直後は呼び、窓より前に届いていたなら呼吸", () => {
    putSession({ ...INITIAL_SESSION_STATE, pending: [question(nowEpochMilliseconds())] })
    expect(renderMotion().current()).toBe("beckon")
    cleanup()

    putSession({
      ...INITIAL_SESSION_STATE,
      pending: [question(nowEpochMilliseconds() - BECKON_WINDOW_MS - 1000)],
    })
    expect(renderMotion().current()).toBe("reading")
  })

  it("答え待ちのまま隠れていたタブが見えるようになると、もう一度呼ぶ", () => {
    putSession({
      ...INITIAL_SESSION_STATE,
      pending: [question(nowEpochMilliseconds() - BECKON_WINDOW_MS - 1000)],
    })
    const motion = renderMotion()

    setPageHidden(true)
    expect(motion.current()).toBe("reading")
    setPageHidden(false)

    expect(motion.current()).toBe("beckon")
  })

  it("依頼・答えを送った直後はうなずく", () => {
    putSession(INITIAL_SESSION_STATE)
    const motion = renderMotion()

    act(() => {
      void useSession.getState().dispatch.session.prompt({ text: "架空", images: [] })
    })
    expect(motion.current()).toBe("nod")
    cleanup()

    putSession({ ...INITIAL_SESSION_STATE, pending: [question(0)] })
    const answered = renderMotion()
    act(() => {
      void useSession.getState().dispatch.session.answer({ id: "ask-1", answer: { kind: "allow" } })
    })
    expect(answered.current()).toBe("nod")
  })

  it("動きを減らす設定では、呼ばず、うなずかない", () => {
    stubPhoneWidth(true)
    putSession({ ...INITIAL_SESSION_STATE, pending: [question(nowEpochMilliseconds())] })
    const motion = renderMotion()
    expect(motion.current()).toBe("reading")

    act(() => {
      void useSession.getState().dispatch.session.prompt({ text: "架空", images: [] })
    })

    expect(motion.current()).toBe("reading")
  })
})
