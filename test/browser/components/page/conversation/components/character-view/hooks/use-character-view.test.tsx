import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useCharacterView } from "../../../../../../../../src/browser/components/page/conversation/components/character-view/hooks/use-character-view.ts"
import { useSession } from "../../../../../../../../src/browser/stores/session.ts"
import { nowEpochMilliseconds } from "../../../../../../../../src/browser/utils/clock.ts"
import type { StampedPendingAsk } from "../../../../../../../../src/shared/session-driver/pending-ask.ts"
import type { SessionRecord } from "../../../../../../../../src/shared/session/session-record.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../../../../src/shared/session/session-state.ts"
import { FIXTURE_CHARACTER, speech } from "../../../../../../../fixture/character-view.tsx"
import {
  reportRecord,
  requestRecord,
  speechRecord,
} from "../../../../../../../fixture/session-record.ts"
import { stubPhoneWidth } from "../../../../../../phone-width.ts"
import { queryClientWrapper } from "../../../../../../query-client.tsx"
import { advanceState, putSession, putState } from "../../../../../../session-store.ts"

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

  describe("声が届いた瞬間", () => {
    const RUNNING = { kind: "running", startedAt: 0 } as const
    const request = requestRecord({ turnId: 0 })

    function runningWith(...records: SessionRecord[]): SessionState {
      return { ...INITIAL_SESSION_STATE, turn: RUNNING, records }
    }

    it("表情に合った動きを1回掛け、動かない表情なら続く動きのまま", () => {
      putSession(runningWith(request))
      const motion = renderMotion()
      expect(motion.current()).toBe("waiting")

      act(() => {
        advanceState(runningWith(request, speechRecord({ expression: "thinking" })))
      })
      expect(motion.current()).toBe("lean")

      act(() => {
        advanceState(
          runningWith(
            request,
            speechRecord({ expression: "thinking" }),
            speechRecord({ expression: "serious" }),
          ),
        )
      })
      expect(motion.current()).toBe("waiting")
    })

    it("動きを減らす設定では掛けない", () => {
      stubPhoneWidth(true)
      putSession(runningWith(request))
      const motion = renderMotion()
      act(() => {
        advanceState(runningWith(request, speechRecord({ expression: "thinking" })))
      })
      expect(motion.current()).toBe("waiting")
    })
  })

  describe("祝う", () => {
    const CELEBRATE_WINDOW_MS = 1300
    const FINISHED_TASK = {
      kind: "task",
      id: "T-1",
      name: "架空のタスク",
      outcome: "finished",
      genre: "unspecified",
    } as const

    function closedWith(finishedAt: number, report: SessionRecord): SessionState {
      return {
        ...INITIAL_SESSION_STATE,
        turn: {
          kind: "finished",
          startedAt: finishedAt - 100,
          finishedAt,
          ending: { kind: "ended" },
        },
        records: [requestRecord(), report],
      }
    }

    it("最後の report が finished のタスクなら祝い、task の無い report なら跳ねる", () => {
      putSession(closedWith(nowEpochMilliseconds(), reportRecord("架空", { task: FINISHED_TASK })))
      expect(renderMotion().current()).toBe("celebrate")
      cleanup()

      putSession(closedWith(nowEpochMilliseconds(), reportRecord("架空")))
      expect(renderMotion().current()).toBe("success")
    })

    it("閉じた時刻が窓より前の復元した姿では動かない", () => {
      putSession(
        closedWith(
          nowEpochMilliseconds() - CELEBRATE_WINDOW_MS - 1000,
          reportRecord("架空", { task: FINISHED_TASK }),
        ),
      )
      expect(renderMotion().current()).toBe("reading")
    })

    it("動きを減らす設定では、finished のタスクでも跳ねるのまま", () => {
      stubPhoneWidth(true)
      putSession(closedWith(nowEpochMilliseconds(), reportRecord("架空", { task: FINISHED_TASK })))
      expect(renderMotion().current()).toBe("success")
    })
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
