import { describe, expect, it } from "vitest"

import type { ServerFrame } from "../../../../src/shared/frame.ts"
import { diffTaskSummary } from "../../../../src/shared/repository/task-summary-change.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import type { PreviousUsageReview } from "../../../../src/shared/usage/usage-review.ts"
import { createStubDriver } from "../../../fixture/session-driver.ts"
import {
  createSessionManager,
  startManagerWithStub,
  waitForBatch,
} from "../../../fixture/session-manager.ts"

describe("createSessionManager（見直し）", () => {
  it("受け付けた見直しの結果は previousUsageReview にも同時に載る", async () => {
    const { manager, stub } = startManagerWithStub()
    const findings = {
      days: 7,
      headline: "架空の冒頭の一言。",
      proposals: [],
    } as const

    stub.emit({ kind: "usage-review-result", findings })
    await waitForBatch()

    const frames: ServerFrame[] = []
    manager.subscribe((frame) => frames.push(frame))
    const [hello] = frames
    expect(hello?.type === "hello" ? hello.state.previousUsageReview : undefined).toEqual({
      kind: "found",
      reviewedAt: 1_000,
      findings,
    })
  })

  it("起こしたときにホームから読んだ前回の結果が、最初の hello の previousUsageReview になる", () => {
    const previous = {
      kind: "found" as const,
      reviewedAt: 500,
      findings: { days: 7, headline: "架空の前回の一言。", proposals: [] },
    }
    const manager = createSessionManager({
      launchSession: () => Promise.resolve(createStubDriver().driver),
      readPreviousUsageReview: (): PreviousUsageReview => previous,
    })

    const frames: ServerFrame[] = []
    manager.subscribe((frame) => frames.push(frame))
    const [hello] = frames

    expect(hello?.type === "hello" ? hello.state.previousUsageReview : undefined).toEqual(previous)
  })

  it("起こし直しても、見直しの結果・前回の結果・提案の実行の状態はどれも残る", async () => {
    const { manager, stub } = startManagerWithStub()
    const findings = { days: 7, headline: "架空の一言。", proposals: [] } as const
    stub.emit({ kind: "usage-review-result", findings })
    stub.emit({ kind: "usage-proposal-run-started", key: "session-length:" })
    await waitForBatch()

    await manager.commands.session.switchCharacter({ name: "fictional" })

    const frames: ServerFrame[] = []
    manager.subscribe((frame) => frames.push(frame))
    const [hello] = frames
    const state = hello?.type === "hello" ? hello.state : undefined
    expect(state?.usageReview).toEqual({ kind: "result", reviewedAt: 1_000, findings })
    expect(state?.previousUsageReview).toEqual({ kind: "found", reviewedAt: 1_000, findings })
    expect(state?.usageProposalRun).toEqual({
      kind: "running",
      key: "session-length:",
      startedAt: 1_000,
      speech: { kind: "none" },
    })
  })

  it("見送るとホームへ書く口が1回呼ばれ、いまの結果と前回の提案の両方から取り除かれる", async () => {
    const { manager, stub, dismissedUsageProposals } = startManagerWithStub()
    const dismissed = {
      kind: "session-length",
      target: "",
      impact: "medium",
      title: "見送られる提案",
      basis: "架空の根拠",
      action: "架空のやること",
      followUp: "delegate",
    } as const
    const kept = {
      ...dismissed,
      kind: "model-choice",
      target: "sonnet",
      title: "残る提案",
    } as const
    const findings = { days: 7, headline: "架空の一言。", proposals: [dismissed, kept] } as const
    stub.emit({ kind: "usage-review-result", findings })
    await waitForBatch()

    const result = await manager.commands.usageReview.dismissProposal({
      kind: dismissed.kind,
      target: dismissed.target,
    })

    expect(result).toEqual({ ok: true })
    expect(dismissedUsageProposals).toEqual([
      {
        kind: dismissed.kind,
        target: dismissed.target,
      },
    ])

    const frames: ServerFrame[] = []
    manager.subscribe((frame) => frames.push(frame))
    const [hello] = frames
    const state = hello?.type === "hello" ? hello.state : undefined
    expect(state?.usageReview).toEqual({
      kind: "result",
      reviewedAt: 1_000,
      findings: { ...findings, proposals: [kept] },
    })
    expect(state?.previousUsageReview).toEqual({
      kind: "found",
      reviewedAt: 1_000,
      findings: { ...findings, proposals: [kept] },
    })
  })
})

describe("タスク一覧の見張り", () => {
  const KNOWN_TASKS = { kind: "known", items: [], omittedClosedCount: 0 } as const

  /** 見張りの起こす・閉じるを数え、流す口を手で握る session-manager。 */
  function startManagerWithTaskWatch() {
    const watchingCalls: boolean[] = []
    const watch = {
      started: 0,
      closed: 0,
      refreshed: 0,
      watching: watchingCalls,
      emit: (_event: SessionEvent): void => {},
    }
    const manager = createSessionManager({
      watchTasks: (onEvent) => {
        watch.started += 1
        watch.emit = onEvent
        return {
          close: () => {
            watch.closed += 1
          },
          setWatching: (watching) => {
            watch.watching.push(watching)
          },
          refresh: () => {
            watch.refreshed += 1
            return Promise.resolve()
          },
        }
      },
      launchSession: () => Promise.resolve(createStubDriver().driver),
    })
    return { manager, watch }
  }

  it("見張りは起こし直しをまたいで1つだけ動き、セッションを閉じたときに閉じる", async () => {
    const { manager, watch } = startManagerWithTaskWatch()

    await manager.commands.session.setChatMode({ chat: true })
    await manager.commands.session.setChatMode({ chat: false })
    expect(watch).toMatchObject({ started: 1, closed: 0 })

    manager.close()
    expect(watch).toMatchObject({ started: 1, closed: 1 })
  })

  it("refreshTasks は見張りの今すぐ読む口を呼ぶ", async () => {
    const { manager, watch } = startManagerWithTaskWatch()

    await manager.refreshTasks()

    expect(watch.refreshed).toBe(1)
  })

  it("画面の購読が0から1になったときに見張りを動かし、最後の1人が抜けたときに止める", () => {
    const { manager, watch } = startManagerWithTaskWatch()
    expect(watch.watching.at(-1)).toBeUndefined()

    const first = manager.subscribe(() => {})
    const second = manager.subscribe(() => {})
    expect(watch.watching.at(-1)).toBe(true)
    first()
    expect(watch.watching.at(-1)).toBe(true)
    second()
    expect(watch.watching.at(-1)).toBe(false)
  })

  it("起こし直しの hello にそれまでのタスク一覧とおすすめの札が残り、そのあと届いた一覧も新しい代に入る", async () => {
    const { manager, watch } = startManagerWithTaskWatch()
    const cards = [{ kind: "resume", reason: "架空の理由" }] as const
    watch.emit({
      kind: "tasks-changed",
      tasks: diffTaskSummary({ kind: "loading" }, KNOWN_TASKS),
    })
    watch.emit({ kind: "recommendation-changed", cards })

    await manager.commands.session.setChatMode({ chat: true })
    const afterRestart: ServerFrame[] = []
    manager.subscribe((frame) => afterRestart.push(frame))
    const [hello] = afterRestart
    expect(hello?.type === "hello" ? hello.state.tasks : undefined).toEqual(KNOWN_TASKS)
    expect(hello?.type === "hello" ? hello.state.recommendation : undefined).toEqual(cards)

    watch.emit({ kind: "tasks-changed", tasks: { kind: "unknown" } })
    await waitForBatch()
    const later: ServerFrame[] = []
    manager.subscribe((frame) => later.push(frame))
    const [laterHello] = later
    expect(laterHello?.type === "hello" ? laterHello.state.tasks : undefined).toEqual({
      kind: "unknown",
    })
  })
})
