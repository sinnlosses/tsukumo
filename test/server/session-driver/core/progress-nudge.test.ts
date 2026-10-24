import { describe, expect, it } from "vitest"

import {
  createProgressNudge,
  type ProgressNudgeTake,
} from "../../../../src/server/session-driver/core/progress-nudge.ts"
import type { BackgroundTaskKind } from "../../../../src/shared/session-driver/background-task.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"

/** 黙っているとみなす長さ（5分）。 */
const PROGRESS_NUDGE_SILENCE_MS = 5 * 60 * 1000

const SPOKEN_AT = 1_000
const DUE_AT = SPOKEN_AT + PROGRESS_NUDGE_SILENCE_MS

const speech: SessionEvent = { kind: "speech", text: "架空のセリフ", expression: "default" }
const turnFinished: SessionEvent = { kind: "turn-finished", outcome: { kind: "completed" } }
const tasks = (kind: BackgroundTaskKind): SessionEvent => ({
  kind: "background-tasks-changed",
  tasks: [{ taskId: "task_a", kind, description: "" }],
})
const progress = (summary: string): SessionEvent => ({
  kind: "delegate-progress",
  taskId: "task_a",
  summary,
})

const NONE: ProgressNudgeTake = { kind: "none" }
const nudge = (summary: string): ProgressNudgeTake => ({ kind: "nudge", summary })

type Scene = readonly (readonly [SessionEvent, number])[]

/** 委譲を始め、着手のセリフを描いてメインのターンが終わったところ。 */
const DELEGATING: Scene = [
  [{ kind: "request", text: "架空の依頼", images: [] }, 0],
  [tasks("agent"), 0],
  [speech, SPOKEN_AT],
  [turnFinished, SPOKEN_AT],
]

describe("ProgressNudge", () => {
  it.each<readonly [string, Scene, readonly number[], readonly ProgressNudgeTake[]]>([
    [
      "5分の1ms前は差し込まず、5分ちょうどで最新の要約を1通だけ差し込む",
      [...DELEGATING, [progress("架空の進み1"), 2_000], [progress("架空の進み2"), 3_000]],
      [DUE_AT - 1, DUE_AT, DUE_AT],
      [NONE, nudge("架空の進み2"), NONE],
    ],
    [
      "委譲していないときは差し込まない",
      [
        [{ kind: "request", text: "架空の依頼", images: [] }, 0],
        [speech, SPOKEN_AT],
        [turnFinished, SPOKEN_AT],
        [progress("架空の進み"), 2_000],
      ],
      [DUE_AT],
      [NONE],
    ],
    ["新しい要約が無いときは差し込まない", DELEGATING, [DUE_AT], [NONE]],
    [
      "委譲先でないタスク（背景の mcp_task など）の要約は拾わない",
      [
        [{ kind: "request", text: "架空の依頼", images: [] }, 0],
        [tasks("other"), 0],
        [speech, SPOKEN_AT],
        [turnFinished, SPOKEN_AT],
        [progress("架空の進み"), 2_000],
      ],
      [DUE_AT],
      [NONE],
    ],
    [
      "セリフより前に届いた要約は数えない",
      [
        [{ kind: "request", text: "架空の依頼", images: [] }, 0],
        [tasks("agent"), 0],
        [progress("架空の進み"), 500],
        [speech, SPOKEN_AT],
        [turnFinished, SPOKEN_AT],
      ],
      [DUE_AT],
      [NONE],
    ],
  ])("%s", (_name, scene, takes, expected) => {
    const watch = createProgressNudge()
    scene.forEach(([event, at]) => watch.observe(event, at))

    expect(takes.map((at) => watch.take(at))).toEqual(expected)
  })

  it("差し込んだあとは、次の要約から差し込んだ時刻を起点に次の5分を測る", () => {
    const watch = createProgressNudge()
    DELEGATING.forEach(([event, at]) => watch.observe(event, at))
    watch.observe(progress("架空の進み1"), 2_000)
    watch.take(DUE_AT)
    watch.observe({ kind: "progress-nudged" }, DUE_AT)
    watch.observe(turnFinished, DUE_AT + 10)
    watch.observe(progress("架空の進み2"), DUE_AT + 20)

    expect(watch.due()).toEqual({ kind: "at", at: DUE_AT + PROGRESS_NUDGE_SILENCE_MS })
    expect(watch.take(DUE_AT + PROGRESS_NUDGE_SILENCE_MS - 1)).toEqual(NONE)
    expect(watch.take(DUE_AT + PROGRESS_NUDGE_SILENCE_MS)).toEqual(nudge("架空の進み2"))
  })

  it.each<readonly [string, readonly (readonly [SessionEvent, number])[], ProgressNudgeTake]>([
    [
      "ターンが終われば、預けていた要約を差し込む",
      [[turnFinished, DUE_AT + 10]],
      nudge("架空の進み"),
    ],
    [
      "預けているあいだにセリフが描かれたら、要約を捨てる",
      [
        [speech, DUE_AT + 5],
        [turnFinished, DUE_AT + 10],
      ],
      NONE,
    ],
  ])("ターンの途中は差し込まず預ける: %s", (_name, after, expected) => {
    const watch = createProgressNudge()
    DELEGATING.forEach(([event, at]) => watch.observe(event, at))
    watch.observe(progress("架空の進み"), 2_000)
    watch.observe({ kind: "turn-resumed" }, DUE_AT - 10)

    expect(watch.due()).toEqual({ kind: "none" })
    expect(watch.take(DUE_AT)).toEqual(NONE)

    after.forEach(([event, at]) => watch.observe(event, at))
    expect(watch.take(DUE_AT + 10)).toEqual(expected)
  })
})
