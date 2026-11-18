import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useWorkStripNow } from "../../../../../../../../src/browser/components/page/conversation/components/main-view/hooks/use-work-strip-now.ts"
import type { SessionEvent } from "../../../../../../../../src/shared/session/session-event.ts"
import { applySessionEvent } from "../../../../../../../../src/shared/session/session-fold.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../../../../src/shared/session/session-state.ts"
import { reportEvent } from "../../../../../../../fixture/report-event.ts"
import { checkedToolUseId } from "../../../../../../../fixture/tool-use-id.ts"
import { plan, START, workRequest } from "../../../../../../../fixture/work-strip.ts"
import { putSession } from "../../../../../../session-store.ts"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function toolStarted(id: string, name: string, input: Record<string, string>): SessionEvent {
  return {
    kind: "tool-started",
    toolUseId: checkedToolUseId(id),
    name,
    input,
    parentToolUseId: undefined,
  }
}

function fold(events: readonly (readonly [SessionEvent, number])[]): SessionState {
  return events.reduce(
    (state, [event, at]) => applySessionEvent(state, event, at),
    INITIAL_SESSION_STATE,
  )
}

function clockAt(now: number): void {
  vi.spyOn(Temporal.Now, "instant").mockReturnValue(Temporal.Instant.fromEpochMilliseconds(now))
}

const WORKING: readonly (readonly [SessionEvent, number])[] = [
  [workRequest, START],
  [plan, START + 1_000],
  [toolStarted("toolu_1", "Read", { file_path: "/架空/a.ts" }), START + 2_000],
]

describe("useWorkStripNow", () => {
  it("作業中は走っている手順の文と秒を返し、抜ける文は無い", () => {
    clockAt(START + 9_000)
    putSession(fold(WORKING))

    const { result } = renderHook(() => useWorkStripNow())

    expect(result.current).toMatchObject({
      kind: "shown",
      statement: { target: "/架空/a.ts", verb: "読んでいます", elapsed: "7秒" },
      leaving: { kind: "none" },
    })
  })

  it("最終レポートに入れ替わったあとの続きのターンでも、走っているあいだは文を返す", () => {
    clockAt(START + 60_000)
    const closed = fold([
      ...WORKING,
      [reportEvent({ toolUseId: "toolu_r1", conclusion: "架空の結論。" }), START + 3_000],
      [{ kind: "turn-finished", outcome: { kind: "completed" } }, START + 4_000],
    ])
    putSession(closed)
    const { result } = renderHook(() => useWorkStripNow())
    expect(result.current.kind).toBe("none")

    act(() => {
      putSession(
        applySessionEvent(
          applySessionEvent(closed, { kind: "turn-resumed" }, START + 50_000),
          toolStarted("toolu_2", "Bash", { command: "架空のコマンド" }),
          START + 51_000,
        ),
      )
    })

    expect(result.current).toMatchObject({
      kind: "shown",
      statement: { target: "架空のコマンド", verb: "走らせています", elapsed: "9秒" },
    })
  })

  it("答え待ちと閉じたやり取りでは none", () => {
    clockAt(START + 9_000)
    const asking = applySessionEvent(
      fold(WORKING),
      {
        kind: "pending-changed",
        pending: [
          {
            kind: "permission",
            id: "toolu_1",
            toolName: "Read",
            input: { file_path: "/架空/a.ts" },
          },
        ],
      },
      START + 5_000,
    )
    putSession(asking)
    const { result } = renderHook(() => useWorkStripNow())
    expect(result.current.kind).toBe("none")

    act(() => {
      putSession(
        fold([
          ...WORKING,
          [reportEvent({ toolUseId: "toolu_r1", conclusion: "架空の結論。" }), START + 3_000],
          [{ kind: "turn-finished", outcome: { kind: "completed" } }, START + 4_000],
        ]),
      )
    })
    expect(result.current.kind).toBe("none")
  })

  it("手順が替わると前の文が leaving に入り、onLeft で消える。秒だけの変化では入らない", () => {
    clockAt(START + 9_000)
    const reading = fold(WORKING)
    putSession(reading)
    const { result, rerender } = renderHook(() => useWorkStripNow())

    clockAt(START + 20_000)
    act(() => {
      putSession(reading)
      rerender()
    })
    expect(result.current).toMatchObject({ kind: "shown", leaving: { kind: "none" } })

    act(() => {
      putSession(
        fold([
          ...WORKING,
          [
            {
              kind: "tool-finished",
              toolUseId: checkedToolUseId("toolu_1"),
              content: "x",
              isError: false,
            },
            START + 21_000,
          ],
          [toolStarted("toolu_2", "Bash", { command: "架空のコマンド" }), START + 22_000],
        ]),
      )
    })
    expect(result.current).toMatchObject({
      kind: "shown",
      statement: { verb: "走らせています" },
      leaving: { kind: "statement", statement: { verb: "読んでいます", target: "/架空/a.ts" } },
    })

    act(() => {
      if (result.current.kind === "shown") {
        result.current.onLeft()
      }
    })
    expect(result.current).toMatchObject({ kind: "shown", leaving: { kind: "none" } })
  })
})
