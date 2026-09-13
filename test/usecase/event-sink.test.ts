import { describe, expect, it } from "bun:test"

import { type SessionEvent } from "../../src/protocol/session-event.ts"
import { type SessionState } from "../../src/protocol/session-state.ts"
import { createEventSink } from "../../src/usecase/event-sink.ts"

// フィクスチャはすべて手で書いた架空のやり取り（docs/coding-standards.md「会話内容の扱い」）。

type Recorder = {
  readonly views: SessionState[]
  readonly endedReasons: string[]
  readonly sink: (event: SessionEvent) => void
}

function createRecorder(now: () => number = () => 0): Recorder {
  const views: SessionState[] = []
  const endedReasons: string[] = []

  const sink = createEventSink(
    (view) => views.push(view),
    (reason) => endedReasons.push(reason),
    now,
  )

  return { views, endedReasons, sink }
}

describe("createEventSink", () => {
  it("イベントのたびに畳み込んだ view を publish に渡す", () => {
    const recorder = createRecorder()

    recorder.sink({ kind: "speech", text: "いくよ！", expression: "proud" })

    expect(recorder.views).toHaveLength(1)
    expect(recorder.views[0]?.speeches).toEqual(["いくよ！"])
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
