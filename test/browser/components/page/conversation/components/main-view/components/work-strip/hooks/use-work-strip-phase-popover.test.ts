import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  useWorkStrip,
  type WorkStripModel,
  type WorkStripPhase,
  type WorkStripPhasePopover,
} from "../../../../../../../../../../src/browser/components/page/conversation/components/main-view/components/work-strip/hooks/use-work-strip.ts"
import type { SessionEvent } from "../../../../../../../../../../src/shared/session/session-event.ts"
import { applySessionEvent } from "../../../../../../../../../../src/shared/session/session-fold.ts"
import type { SessionState } from "../../../../../../../../../../src/shared/session/session-state.ts"
import {
  foldTimed,
  workRequest,
  START,
  stripAt,
} from "../../../../../../../../../fixture/work-strip.ts"
import { putSession, putState } from "../../../../../../../../session-store.ts"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("useWorkStrip（段の吹き出し）", () => {
  const FOUR = ["架空の段A", "架空の段B", "架空の段C", "架空の段D"]

  function workPlan(
    phases: Extract<SessionEvent, { readonly kind: "work-plan" }>["phases"],
    current: number,
    phaseSummary: string,
  ): SessionEvent {
    return {
      kind: "work-plan",
      delegatedRange: { kind: "none" },
      skippedPhases: [],
      awaitingSummary: { kind: "none" },
      phases,
      current,
      finishedInGroup: [],
      phaseSummary,
    }
  }

  function fourPlan(current: number, phaseSummary: string): SessionEvent {
    return workPlan(FOUR, current, phaseSummary)
  }

  /** 段A を 1分40秒で済ませてまとめを渡し、段B をまとめ無しで済ませ、段C が 1分56秒 走っている。 */
  const progressed = foldTimed([
    [workRequest, START],
    [fourPlan(0, ""), START + 1_000],
    [fourPlan(1, "架空の段Aのまとめ。"), START + 101_000],
    [fourPlan(2, ""), START + 130_000],
  ])
  const NOW = START + 246_000

  function phasesOf(strip: WorkStripModel): readonly WorkStripPhase[] {
    return strip.kind === "none"
      ? []
      : strip.phases.flatMap((slot) => (slot.kind === "phase" ? [slot.phase] : slot.phases))
  }

  /** 帯を描き、`index` 番目の丸を押したあとの帯。 */
  function openedAt(state: SessionState, index: number): WorkStripModel {
    vi.spyOn(Temporal.Now, "instant").mockReturnValue(Temporal.Instant.fromEpochMilliseconds(NOW))
    putSession(state)
    const { result } = renderHook(() => useWorkStrip())
    act(() => {
      phasesOf(result.current)[index]?.onToggle()
    })
    return result.current
  }

  function popoverAt(strip: WorkStripModel, index: number): WorkStripPhasePopover | undefined {
    return phasesOf(strip)[index]?.popover
  }

  it("押す前はどの丸の吹き出しも閉じている", () => {
    expect(phasesOf(stripAt(progressed, NOW)).map((phase) => phase.popover.kind)).toEqual([
      "closed",
      "closed",
      "closed",
      "closed",
    ])
  })

  it("済んだ段は「✓ 名前」・所要・段のまとめ・手順への口", () => {
    expect(popoverAt(openedAt(progressed, 0), 0)).toMatchObject({
      kind: "open",
      title: "✓ 架空の段A",
      meta: "済み · 所要 1分40秒",
      summary: "架空の段Aのまとめ。",
      toSteps: { kind: "shown" },
    })
  })

  it("まとめを渡さずに済んだ段は、まとめが空", () => {
    expect(popoverAt(openedAt(progressed, 1), 1)).toMatchObject({
      meta: "済み · 所要 29秒",
      summary: "",
    })
  })

  it("今の段は「番号. 名前」とこの段の経過だけで、まとめも手順への口も無い", () => {
    expect(popoverAt(openedAt(progressed, 2), 2)).toMatchObject({
      title: "3. 架空の段C",
      meta: "いま · この段 1分56秒",
      summary: "",
      toSteps: { kind: "none" },
    })
  })

  it("まだの段は名前と「これから」だけ", () => {
    expect(popoverAt(openedAt(progressed, 3), 3)).toMatchObject({
      title: "4. 架空の段D",
      meta: "これから",
      summary: "",
      toSteps: { kind: "none" },
    })
  })

  it("答え待ちの今の段は、状態の行を「答え待ち」にする", () => {
    const asking = applySessionEvent(
      progressed,
      {
        kind: "pending-changed",
        pending: [
          {
            kind: "permission",
            id: "toolu_ask",
            toolName: "Bash",
            input: { command: "架空のコマンド" },
          },
        ],
      },
      START + 200_000,
    )

    expect(popoverAt(openedAt(asking, 2), 2)).toMatchObject({
      title: "3. 架空の段C",
      meta: "答え待ち · この段 1分56秒",
    })
  })

  it("記録が途中から始まって所要が引けない済んだ段は「所要 不明」", () => {
    const midway = foldTimed([
      [workRequest, START],
      [fourPlan(1, "架空のまとめ。"), START + 1_000],
    ])

    expect(popoverAt(openedAt(midway, 0), 0)).toMatchObject({ meta: "済み · 所要 不明" })
  })

  it("並列の段の中の丸も押せて、同じ形の吹き出しが出る", () => {
    const grouped = foldTimed([
      [workRequest, START],
      [workPlan(["架空の段A", ["架空の段B", "架空の段C"]], 0, ""), START + 1_000],
      [
        workPlan(["架空の段A", ["架空の段B", "架空の段C"]], 1, "架空の段Aのまとめ。"),
        START + 11_000,
      ],
    ])

    expect(popoverAt(openedAt(grouped, 2), 2)).toMatchObject({
      title: "3. 架空の段C",
      meta: "いま · この段 3分55秒",
    })
  })

  it("開くのは押した丸だけで、同じ丸をもう一度押すと閉じ、別の丸を押すと開き替わる", () => {
    vi.spyOn(Temporal.Now, "instant").mockReturnValue(Temporal.Instant.fromEpochMilliseconds(NOW))
    putSession(progressed)
    const { result } = renderHook(() => useWorkStrip())
    const kinds = () => phasesOf(result.current).map((phase) => phase.popover.kind)

    act(() => phasesOf(result.current)[0]?.onToggle())
    expect(kinds()).toEqual(["open", "closed", "closed", "closed"])

    act(() => phasesOf(result.current)[3]?.onToggle())
    expect(kinds()).toEqual(["closed", "closed", "closed", "open"])

    act(() => phasesOf(result.current)[3]?.onToggle())
    expect(kinds()).toEqual(["closed", "closed", "closed", "closed"])
  })

  it("手順への口を押すと吹き出しが閉じる", () => {
    vi.spyOn(Temporal.Now, "instant").mockReturnValue(Temporal.Instant.fromEpochMilliseconds(NOW))
    putSession(progressed)
    const { result } = renderHook(() => useWorkStrip())
    act(() => phasesOf(result.current)[0]?.onToggle())

    const opened = popoverAt(result.current, 0)
    act(() => {
      if (opened?.kind === "open" && opened.toSteps.kind === "shown") {
        opened.toSteps.onGo()
      }
    })

    expect(popoverAt(result.current, 0)?.kind).toBe("closed")
  })

  it("やり取りが替わると閉じる", () => {
    vi.spyOn(Temporal.Now, "instant").mockReturnValue(Temporal.Instant.fromEpochMilliseconds(NOW))
    putSession(progressed)
    const { result } = renderHook(() => useWorkStrip())
    act(() => phasesOf(result.current)[0]?.onToggle())

    act(() => {
      putState(
        [workRequest, fourPlan(1, "架空のまとめ。")].reduce(
          (state, event) => applySessionEvent(state, event, START + 240_000),
          progressed,
        ),
      )
    })

    expect(phasesOf(result.current).map((phase) => phase.popover.kind)).toEqual([
      "closed",
      "closed",
      "closed",
      "closed",
    ])
  })
})
