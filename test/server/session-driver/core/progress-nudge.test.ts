import { describe, expect, it } from "vitest"

import {
  createProgressNudge,
  isProgressNudgePrompt,
  progressNudgeSendText,
  type ProgressNudgeTake,
  stepLimitPromptText,
} from "../../../../src/server/session-driver/core/progress-nudge.ts"
import type { BackgroundTaskKind } from "../../../../src/shared/session-driver/background-task.ts"
import type { DelegateReturn } from "../../../../src/shared/session/delegate-return.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import { requestEvent } from "../../../fixture/session-event.ts"
import { checkedTaskId } from "../../../fixture/task-id.ts"

/** 黙っているとみなす長さ（5分）。 */
const PROGRESS_NUDGE_SILENCE_MS = 5 * 60 * 1000

const SPOKEN_AT = 1_000
const DUE_AT = SPOKEN_AT + PROGRESS_NUDGE_SILENCE_MS

const speech: SessionEvent = { kind: "speech", text: "架空のセリフ", expression: "default" }
const turnFinished: SessionEvent = { kind: "turn-finished", outcome: { kind: "completed" } }
const tasks = (kind: BackgroundTaskKind): SessionEvent => ({
  kind: "background-tasks-changed",
  tasks: [{ taskId: checkedTaskId("task_a"), kind, description: "" }],
})
const progress = (summary: string): SessionEvent => ({
  kind: "delegate-progress",
  taskId: checkedTaskId("task_a"),
  summary,
})

const NONE: ProgressNudgeTake = { kind: "none" }
const nudge = (summary: string): ProgressNudgeTake => ({ kind: "nudge", summary })

type Scene = readonly (readonly [SessionEvent, number])[]

/** 委譲を始め、着手のセリフを描いてメインのターンが終わったところ。 */
const DELEGATING: Scene = [
  [requestEvent(), 0],
  [tasks("agent"), 0],
  [speech, SPOKEN_AT],
  [turnFinished, SPOKEN_AT],
]

describe("差し込みの文面", () => {
  it("委譲先の進みと歩数の上限は前置きが違い、どちらも差し込みの包みとして読める", () => {
    const delegated = progressNudgeSendText({ kind: "nudge", summary: "架空の進み" }, "")
    const steps = stepLimitPromptText(200)

    expect(delegated).toContain("委譲先の進み")
    expect(steps).not.toContain("委譲先")
    expect(steps).toContain("200")
    expect(isProgressNudgePrompt(delegated)).toBe(true)
    expect(isProgressNudgePrompt(steps)).toBe(true)
  })
})

const returned = (handback: DelegateReturn): SessionEvent => ({
  kind: "delegate-returned",
  handback,
})
const done = (phase: number, summary = "架空のまとめ"): SessionEvent =>
  returned({ kind: "phase-done", phase, count: 3, summary })
const advanced = (phase: number, summary = "架空のまとめ", skipped = false): ProgressNudgeTake => ({
  kind: "phase-advanced",
  phase,
  count: 3,
  summary,
  skipped,
})
const PHASE_AT = SPOKEN_AT + 10

describe("フェーズの切れ目の差し込み", () => {
  it.each<readonly [string, Scene, readonly number[], readonly ProgressNudgeTake[]]>([
    [
      "ターンの外なら黙りを待たず取り出す",
      [...DELEGATING, [done(1), PHASE_AT]],
      [PHASE_AT, PHASE_AT],
      [advanced(1), NONE],
    ],
    [
      "ターンの中は預け、終わったら出す",
      [...DELEGATING, [{ kind: "turn-resumed" }, PHASE_AT - 5], [done(1), PHASE_AT]],
      [PHASE_AT],
      [NONE],
    ],
    [
      "セリフが描かれたら捨てる",
      [...DELEGATING, [done(1), PHASE_AT], [speech, PHASE_AT + 1]],
      [PHASE_AT + 2],
      [NONE],
    ],
    [
      "2つ進んでも1通で最新",
      [...DELEGATING, [done(1), PHASE_AT], [done(2, "架空のまとめ2"), PHASE_AT + 1]],
      [PHASE_AT + 2, PHASE_AT + 2],
      [advanced(2, "架空のまとめ2"), NONE],
    ],
    [
      "stopped では差し込まない",
      [
        ...DELEGATING,
        [returned({ kind: "stopped", phase: 1, count: 3, summary: "架空の理由" }), PHASE_AT],
      ],
      [PHASE_AT],
      [NONE],
    ],
    [
      "phase-skipped は skipped の印つきで取り出す",
      [...DELEGATING, [returned({ kind: "phase-skipped", phase: 2, count: 3 }), PHASE_AT]],
      [PHASE_AT],
      [advanced(2, "", true)],
    ],
    [
      "バックグラウンドタスクが0件になったら捨てる",
      [
        ...DELEGATING,
        [done(1), PHASE_AT],
        [{ kind: "background-tasks-changed", tasks: [] }, PHASE_AT + 1],
      ],
      [PHASE_AT + 2],
      [NONE],
    ],
  ])("%s", (_name, scene, takes, expected) => {
    const watch = createProgressNudge()
    scene.forEach(([event, at]) => watch.observe(event, at))

    expect(takes.map((at) => watch.take(at))).toEqual(expected)
  })

  it("ターンの終わりまで預け、終わったら取り出す", () => {
    const watch = createProgressNudge()
    DELEGATING.forEach(([event, at]) => watch.observe(event, at))
    watch.observe({ kind: "turn-resumed" }, PHASE_AT - 5)
    watch.observe(done(1), PHASE_AT)

    expect(watch.take(PHASE_AT + 1)).toEqual(NONE)

    watch.observe(turnFinished, PHASE_AT + 2)
    expect(watch.take(PHASE_AT + 3)).toEqual(advanced(1))
  })

  it("文面は包みで読め、帯の位置と summary を言う", () => {
    const text = progressNudgeSendText(
      { kind: "phase-advanced", phase: 1, count: 3, summary: "架空のまとめ", skipped: false },
      "架空の帯の位置",
    )
    const bare = progressNudgeSendText(
      { kind: "phase-advanced", phase: 1, count: 3, summary: "", skipped: false },
      "",
    )
    const others = [
      progressNudgeSendText({ kind: "nudge", summary: "架空の進み" }, "架空の帯の位置"),
      progressNudgeSendText({ kind: "shell-wait", count: 1 }, "架空の帯の位置"),
    ]

    expect([text, bare, ...others].every(isProgressNudgePrompt)).toBe(true)
    expect(text).toContain("架空の帯の位置")
    expect(text).toContain("まとめ: 架空のまとめ")
    expect(bare).not.toContain("まとめ")
  })
})

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
        [requestEvent(), 0],
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
        [requestEvent(), 0],
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
        [requestEvent(), 0],
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

  describe("背景の Bash だけを待っているとき", () => {
    const WAITING: Scene = [
      [requestEvent(), 0],
      [tasks("shell"), 0],
      [speech, SPOKEN_AT],
      [turnFinished, SPOKEN_AT],
    ]
    const shellWait = (count: number): ProgressNudgeTake => ({ kind: "shell-wait", count })

    it.each<readonly [string, Scene, readonly number[], readonly ProgressNudgeTake[]]>([
      [
        "要約が無くても5分で件数だけの差し込みが出て、5分未満は出ない",
        WAITING,
        [DUE_AT - 1, DUE_AT, DUE_AT],
        [NONE, shellWait(1), NONE],
      ],
      [
        "セリフのあとは測り直す",
        [...WAITING, [speech, DUE_AT - 10]],
        [DUE_AT, DUE_AT - 10 + PROGRESS_NUDGE_SILENCE_MS],
        [NONE, shellWait(1)],
      ],
      [
        "待ちが終わったら出ない",
        [...WAITING, [{ kind: "background-tasks-changed", tasks: [] }, 2_000]],
        [DUE_AT],
        [NONE],
      ],
    ])("%s", (_name, scene, takes, expected) => {
      const watch = createProgressNudge()
      scene.forEach(([event, at]) => watch.observe(event, at))

      expect(takes.map((at) => watch.take(at))).toEqual(expected)
    })

    it("文面は件数だけを運び、差し込みの包みとして読める", () => {
      const text = progressNudgeSendText({ kind: "shell-wait", count: 2 }, "")

      expect(text).toContain("背景の Bash を 2 件待っている")
      expect(isProgressNudgePrompt(text)).toBe(true)
    })
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
