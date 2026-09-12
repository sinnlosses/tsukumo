import { describe, expect, it } from "bun:test"

import { type SessionEvent } from "../../src/domain/session-event.ts"
import { createEventSink } from "../../src/usecase/event-sink.ts"
import { type SessionView } from "../../src/usecase/session-view.ts"

// フィクスチャはすべて手で書いた架空のやり取り（docs/coding-standards.md「会話内容の扱い」）。

type Recorder = {
  readonly views: SessionView[]
  readonly turnStatuses: {
    readonly turnStartedAt: number | undefined
    readonly turnFinishedAt: number | undefined
  }[]
  readonly pendingAnswers: unknown[]
  readonly commandsCalls: unknown[][]
  readonly endedReasons: string[]
  readonly sink: (event: SessionEvent) => void
}

function createRecorder(now: () => number = () => 0): Recorder {
  const views: SessionView[] = []
  const turnStatuses: Recorder["turnStatuses"] = []
  const pendingAnswers: unknown[] = []
  const commandsCalls: unknown[][] = []
  const endedReasons: string[] = []

  const sink = createEventSink(
    (view) => views.push(view),
    (status) => turnStatuses.push(status),
    (pending) => pendingAnswers.push(pending),
    (commands) => commandsCalls.push([...commands]),
    (reason) => endedReasons.push(reason),
    now,
  )

  return { views, turnStatuses, pendingAnswers, commandsCalls, endedReasons, sink }
}

describe("createEventSink", () => {
  it("イベントのたびに畳み込んだ view を publish に渡す", () => {
    const recorder = createRecorder()

    recorder.sink({ kind: "speech", text: "いくよ！", expression: "proud" })

    expect(recorder.views).toHaveLength(1)
    expect(recorder.views[0]?.speeches).toEqual(["いくよ！"])
  })

  it("turnInProgress が変わったときだけ publishTurnStatus を呼ぶ（開始・終了の時刻を持つ）", () => {
    const times = [100, 200, 300]
    let index = 0
    const recorder = createRecorder(() => times[index++] ?? times.at(-1) ?? 0)

    recorder.sink({ kind: "request", text: "依頼" })
    expect(recorder.turnStatuses).toEqual([{ turnStartedAt: 100, turnFinishedAt: undefined }])

    // 進行中のままの partial-utterance では呼ばれない。
    recorder.sink({ kind: "partial-utterance", text: "途中" })
    expect(recorder.turnStatuses).toHaveLength(1)

    recorder.sink({ kind: "turn-finished", status: "success" })
    expect(recorder.turnStatuses).toEqual([
      { turnStartedAt: 100, turnFinishedAt: undefined },
      { turnStartedAt: 100, turnFinishedAt: 300 },
    ])
  })

  it("答え待ちの列の先頭が変わったときだけ publishPendingAnswer を呼び、無くなったら undefined を渡す", () => {
    const recorder = createRecorder()

    recorder.sink({
      kind: "pending-changed",
      pending: [{ kind: "permission", id: "toolu_1", toolName: "Bash", input: {} }],
    })
    expect(recorder.pendingAnswers).toEqual([
      { kind: "permission", id: "toolu_1", toolName: "Bash", input: {} },
    ])

    // 同じ id のままなら呼ばない。
    recorder.sink({
      kind: "pending-changed",
      pending: [{ kind: "permission", id: "toolu_1", toolName: "Bash", input: {} }],
    })
    expect(recorder.pendingAnswers).toHaveLength(1)

    recorder.sink({ kind: "pending-changed", pending: [] })
    expect(recorder.pendingAnswers).toEqual([
      { kind: "permission", id: "toolu_1", toolName: "Bash", input: {} },
      undefined,
    ])
  })

  it("setCommands は毎イベントで呼び、端末専用を除いた候補を渡す", () => {
    const recorder = createRecorder()

    recorder.sink({
      kind: "session-info",
      sessionId: "s-1",
      model: undefined,
      permissionMode: undefined,
      slashCommands: ["clear", "doctor"],
      terminalSlashCommands: ["doctor"],
    })

    expect(recorder.commandsCalls.at(-1)).toEqual([{ name: "clear", description: undefined }])
  })

  it("session-ended で理由を通知する", () => {
    const recorder = createRecorder()

    recorder.sink({ kind: "session-ended", reason: "セッションが終了した" })

    expect(recorder.endedReasons).toEqual(["セッションが終了した"])
  })

  it("実行中のツールが作業中の遅延を超えたら、setTimeout でもう一度 publish する", async () => {
    const recorder = createRecorder()

    recorder.sink({
      kind: "tool-started",
      toolUseId: "toolu_1",
      name: "Read",
      input: {},
      parentToolUseId: undefined,
    })
    const publishCountAfterStart = recorder.views.length

    // WORKING_EXPRESSION_DELAY_MS（1秒）を超えるまで待つ。
    await new Promise((resolve) => setTimeout(resolve, 1100))

    expect(recorder.views.length).toBeGreaterThan(publishCountAfterStart)
  }, 3000)
})
