import { describe, expect, it } from "vitest"

import {
  createSpeechReview,
  SPEECH_NOTHING_NEW_REJECTION_TEXT,
  type SpeechReview,
} from "../../../../src/server/session-driver/core/speech-review.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"

const SESSION_INFO: SessionEvent = {
  kind: "session-info",
  sessionId: "架空のセッション",
  model: undefined,
  permissionMode: undefined,
  slashCommands: [],
  terminalSlashCommands: [],
}
const FINISHED: SessionEvent = { kind: "turn-finished", outcome: { kind: "completed" } }
const REJECTED = { kind: "rejected", text: SPEECH_NOTHING_NEW_REJECTION_TEXT } as const

const speechOf = (text: string): Extract<SessionEvent, { kind: "speech" }> => ({
  kind: "speech",
  text,
  expression: "default",
})

const speakCalled = (toolUseId: string, text: string): SessionEvent => ({
  kind: "speak-called",
  toolUseId,
  speech: speechOf(text),
})

const finished = (toolUseId: string, isError: boolean): SessionEvent => ({
  kind: "tool-finished",
  toolUseId,
  content: isError ? SPEECH_NOTHING_NEW_REJECTION_TEXT : "ok",
  isError,
})

const toolStarted = (toolUseId: string, scope: "main" | "subagent"): SessionEvent => ({
  kind: "tool-started",
  toolUseId,
  name: "Bash",
  input: {},
  parentToolUseId: scope === "main" ? undefined : "toolu_agent",
})

const backgroundTasks = (taskIds: readonly string[]): SessionEvent => ({
  kind: "background-tasks-changed",
  tasks: taskIds.map((taskId) => ({ taskId, kind: "agent", description: "架空の委譲" })),
})

/** handler の判定から結果まで、本物の駆動と同じ順に1回呼ぶ。`pass` が流したイベントを返す。 */
function call(review: SpeechReview, toolUseId: string, text: string): readonly SessionEvent[] {
  const verdict = review.judge()
  return [
    ...review.pass(speakCalled(toolUseId, text)),
    ...review.pass(finished(toolUseId, verdict.kind === "rejected")),
  ]
}

describe("SpeechReview", () => {
  it("セッションの頭の speak は通り、セリフが結果の直前に出る", () => {
    const review = createSpeechReview()

    expect(call(review, "toolu_s1", "架空のセリフ1")).toEqual([
      speechOf("架空のセリフ1"),
      finished("toolu_s1", false),
    ])
  })

  it("描いたセリフのあと何も届かずに呼んだ2回目は差し戻され、描かれない", () => {
    const review = createSpeechReview()
    call(review, "toolu_s1", "架空のセリフ1")

    expect(review.judge()).toEqual(REJECTED)
    expect(review.pass(speakCalled("toolu_s2", "架空のセリフ2"))).toEqual([])
    expect(review.pass(finished("toolu_s2", true))).toEqual([finished("toolu_s2", true)])
  })

  it("新しいことが無いまま3回呼べば3回とも差し戻される", () => {
    const review = createSpeechReview()
    call(review, "toolu_s1", "架空のセリフ1")

    const spoken = ["toolu_s2", "toolu_s3", "toolu_s4"].flatMap((id) =>
      call(review, id, "架空の待っているセリフ"),
    )

    expect(spoken.filter((event) => event.kind === "speech")).toEqual([])
    expect(review.judge()).toEqual(REJECTED)
  })

  it("あいだにメインのツールの完了を挟めば通る", () => {
    const review = createSpeechReview()
    call(review, "toolu_s1", "架空のセリフ1")
    review.pass(toolStarted("toolu_bash", "main"))
    review.pass(finished("toolu_bash", false))

    expect(call(review, "toolu_s2", "架空のセリフ2")).toContainEqual(speechOf("架空のセリフ2"))
  })

  it("依頼・ターンの始まり・ターンの頭・背景のタスクの終わりのあとも通る", () => {
    const openings: readonly (readonly SessionEvent[])[] = [
      [{ kind: "request", text: "架空の依頼", images: [] }],
      [{ kind: "turn-started" }],
      [SESSION_INFO],
      [backgroundTasks([])],
    ]

    for (const opening of openings) {
      const review = createSpeechReview()
      review.pass(backgroundTasks(["task_1"]))
      call(review, "toolu_s1", "架空のセリフ1")
      for (const event of opening) {
        review.pass(event)
      }

      expect(review.judge()).toEqual({ kind: "accepted" })
    }
  })

  it("サブエージェントのツールの完了は新しいことに数えない", () => {
    const review = createSpeechReview()
    call(review, "toolu_s1", "架空のセリフ1")
    review.pass(toolStarted("toolu_sub_bash", "subagent"))
    review.pass(finished("toolu_sub_bash", false))

    expect(review.judge()).toEqual(REJECTED)
  })

  it("背景のタスクが増えただけでは新しいことに数えない", () => {
    const review = createSpeechReview()
    call(review, "toolu_s1", "架空のセリフ1")
    review.pass(backgroundTasks(["task_1"]))

    expect(review.judge()).toEqual(REJECTED)
  })

  it("預かったまま結果の届かなかった呼び出しは、turn-finished の直前に出る", () => {
    const review = createSpeechReview()
    review.pass(speakCalled("toolu_s1", "架空のセリフ1"))

    expect(review.pass(FINISHED)).toEqual([speechOf("架空のセリフ1"), FINISHED])
    expect(review.pass(FINISHED)).toEqual([FINISHED])
  })

  it("speak-called 以外のイベントはそのまま流す", () => {
    const review = createSpeechReview()
    const utterance: SessionEvent = { kind: "utterance", text: "架空の本文" }

    expect(review.pass(utterance)).toEqual([utterance])
    expect(review.pass(speechOf("架空のサブエージェントのセリフ"))).toEqual([
      speechOf("架空のサブエージェントのセリフ"),
    ])
  })
})
