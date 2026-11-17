import { describe, expect, it } from "vitest"

import {
  nextPortraitMotionTransitionDelayMs,
  resolvePortraitMotion,
  type ArrivalMotion,
  type PortraitMotionInput,
} from "../../../src/browser/domain/portrait-motion.ts"

/** 失敗の動きが当たる期間（失敗の直後から）。 */
const FAILURE_MOTION_WINDOW_MS = 400

/** 完了の動きが当たる期間（ターンが終わった直後から）。 */
const SUCCESS_MOTION_WINDOW_MS = 700

describe("resolvePortraitMotion", () => {
  const FAILED_TURN = {
    kind: "finished",
    startedAt: 0,
    finishedAt: 1000,
    ending: { kind: "failed", failure: { kind: "api-error", error: "overloaded" } },
  } satisfies PortraitMotionInput["turn"]

  it("ターンが失敗で終わった直後（期間の内）は「失敗でびくっ」", () => {
    const input: PortraitMotionInput = {
      turn: FAILED_TURN,
      lastToolFailureAt: undefined,
      draftingReport: false,
    }
    expect(resolvePortraitMotion(input, 1000 + FAILURE_MOTION_WINDOW_MS - 1)).toBe("failure")
  })

  it("失敗で終わったターンには、びくっの期間を過ぎても「完了の反応」を出さない", () => {
    const input: PortraitMotionInput = {
      turn: FAILED_TURN,
      lastToolFailureAt: undefined,
      draftingReport: false,
    }
    expect(resolvePortraitMotion(input, 1000 + FAILURE_MOTION_WINDOW_MS)).toBe("reading")
    expect(nextPortraitMotionTransitionDelayMs(input, 1000)).toBe(FAILURE_MOTION_WINDOW_MS)
    expect(nextPortraitMotionTransitionDelayMs(input, 1000 + FAILURE_MOTION_WINDOW_MS)).toBe(
      undefined,
    )
  })

  it("ターンが進行中でなく、直近の完了・失敗も無ければ「読んでいる」（呼吸だけ）", () => {
    const input: PortraitMotionInput = {
      turn: { kind: "idle" },
      lastToolFailureAt: undefined,
      draftingReport: false,
    }
    expect(resolvePortraitMotion(input, 0)).toBe("reading")
  })

  it("ターンが進行中なら「待っている」（領域の中を歩く）", () => {
    const input: PortraitMotionInput = {
      turn: { kind: "running", startedAt: 0 },
      lastToolFailureAt: undefined,
      draftingReport: false,
    }
    expect(resolvePortraitMotion(input, 0)).toBe("waiting")
  })

  it("ターンが終わった直後（期間の内）は「完了の反応」", () => {
    const input: PortraitMotionInput = {
      turn: { kind: "finished", startedAt: 0, finishedAt: 1000, ending: { kind: "ended" } },
      lastToolFailureAt: undefined,
      draftingReport: false,
    }
    expect(resolvePortraitMotion(input, 1000 + SUCCESS_MOTION_WINDOW_MS - 1)).toBe("success")
  })

  const ENDED_TURN = {
    kind: "finished",
    startedAt: 0,
    finishedAt: 1000,
    ending: { kind: "ended" },
  } satisfies PortraitMotionInput["turn"]

  it("背景の作業が残ったままターンが閉じたら、跳ねずに「待っている」（歩く）", () => {
    const input: PortraitMotionInput = {
      turn: ENDED_TURN,
      lastToolFailureAt: undefined,
      draftingReport: false,
      backgroundRunning: true,
    }
    expect(resolvePortraitMotion(input, 1001)).toBe("waiting")
    expect(nextPortraitMotionTransitionDelayMs(input, 1001)).toBeUndefined()
  })

  it("背景の作業が無くなって完了で閉じたら跳ねる", () => {
    const input: PortraitMotionInput = {
      turn: ENDED_TURN,
      lastToolFailureAt: undefined,
      draftingReport: false,
      backgroundRunning: false,
    }
    expect(resolvePortraitMotion(input, 1001)).toBe("success")
  })

  it("利用者が止めたら、跳ねずに「読んでいる」（呼吸）", () => {
    const input: PortraitMotionInput = {
      turn: ENDED_TURN,
      lastToolFailureAt: undefined,
      draftingReport: false,
      interrupted: true,
    }
    expect(resolvePortraitMotion(input, 1001)).toBe("reading")
    expect(resolvePortraitMotion({ ...input, backgroundRunning: true }, 1001)).toBe("reading")
  })

  it("失敗で閉じたあとは、背景の作業が残っていても歩かない", () => {
    const input: PortraitMotionInput = {
      turn: FAILED_TURN,
      lastToolFailureAt: undefined,
      draftingReport: false,
      backgroundRunning: true,
    }
    expect(resolvePortraitMotion(input, 1000 + FAILURE_MOTION_WINDOW_MS)).toBe("reading")
  })

  it("完了の反応の期間を過ぎたら「読んでいる」に戻る", () => {
    const input: PortraitMotionInput = {
      turn: { kind: "finished", startedAt: 0, finishedAt: 1000, ending: { kind: "ended" } },
      lastToolFailureAt: undefined,
      draftingReport: false,
    }
    expect(resolvePortraitMotion(input, 1000 + SUCCESS_MOTION_WINDOW_MS)).toBe("reading")
  })

  it("ツールが失敗した直後（期間の内）は「失敗でびくっ」", () => {
    const input: PortraitMotionInput = {
      turn: { kind: "running", startedAt: 0 },
      lastToolFailureAt: 2000,
      draftingReport: false,
    }
    expect(resolvePortraitMotion(input, 2000 + FAILURE_MOTION_WINDOW_MS - 1)).toBe("failure")
  })

  it("失敗の期間を過ぎたら、ターンが進行中のままなら「待っている」へ戻る", () => {
    const input: PortraitMotionInput = {
      turn: { kind: "running", startedAt: 0 },
      lastToolFailureAt: 2000,
      draftingReport: false,
    }
    expect(resolvePortraitMotion(input, 2000 + FAILURE_MOTION_WINDOW_MS)).toBe("waiting")
  })

  it("失敗は完了の反応より優先する", () => {
    const input: PortraitMotionInput = {
      turn: { kind: "finished", startedAt: 0, finishedAt: 1000, ending: { kind: "ended" } },
      lastToolFailureAt: 1000,
      draftingReport: false,
    }
    expect(resolvePortraitMotion(input, 1000 + 1)).toBe("failure")
  })

  it("ターンが進行中で report の引数を書いている最中なら「書いている」", () => {
    const input: PortraitMotionInput = {
      turn: { kind: "running", startedAt: 0 },
      lastToolFailureAt: undefined,
      draftingReport: true,
    }
    expect(resolvePortraitMotion(input, 0)).toBe("writing")
  })

  it("ターンが進行中でなければ、report を書いている印があっても「書いている」にならない（読んでいるに戻る）", () => {
    const input: PortraitMotionInput = {
      turn: { kind: "idle" },
      lastToolFailureAt: undefined,
      draftingReport: true,
    }
    expect(resolvePortraitMotion(input, 0)).toBe("reading")
  })

  it("完了の反応は「書いている」より優先する", () => {
    const input: PortraitMotionInput = {
      turn: { kind: "finished", startedAt: 0, finishedAt: 1000, ending: { kind: "ended" } },
      lastToolFailureAt: undefined,
      draftingReport: true,
    }
    expect(resolvePortraitMotion(input, 1000 + SUCCESS_MOTION_WINDOW_MS - 1)).toBe("success")
  })

  it("失敗でびくっは「書いている」より優先する", () => {
    const input: PortraitMotionInput = {
      turn: { kind: "running", startedAt: 0 },
      lastToolFailureAt: 2000,
      draftingReport: true,
    }
    expect(resolvePortraitMotion(input, 2000 + FAILURE_MOTION_WINDOW_MS - 1)).toBe("failure")
  })
})

/** 呼ぶ動きが当たる期間（答え待ちの始まりから）。 */
const BECKON_MOTION_WINDOW_MS = 10_800

/** うなずく動きが当たる期間（送った直後から）。 */
const NOD_MOTION_WINDOW_MS = 500

describe("呼ぶ・うなずく", () => {
  const A = 100_000
  const W = BECKON_MOTION_WINDOW_MS
  const N = NOD_MOTION_WINDOW_MS
  const IDLE: PortraitMotionInput = {
    turn: { kind: "idle" },
    lastToolFailureAt: undefined,
    draftingReport: false,
  }
  const RUNNING: PortraitMotionInput = { ...IDLE, turn: { kind: "running", startedAt: 0 } }

  it("答え待ちが始まってから呼ぶ期間のあいだは「呼ぶ」", () => {
    expect(resolvePortraitMotion({ ...IDLE, askedAt: A }, A + W - 1)).toBe("beckon")
  })

  it("呼ぶ期間を過ぎたら、ターンが走っていても歩かず呼吸", () => {
    expect(resolvePortraitMotion({ ...RUNNING, askedAt: A }, A + W)).toBe("reading")
  })

  it("答え待ちでタブが隠れているあいだは呼ばない", () => {
    expect(resolvePortraitMotion({ ...IDLE, askedAt: A, tab: { kind: "hidden" } }, A + 1)).toBe(
      "reading",
    )
  })

  it("隠れていたタブが見えるようになった時刻から、もう一度だけ呼ぶ", () => {
    const R = A + W + 5000
    const input: PortraitMotionInput = { ...IDLE, askedAt: A, tab: { kind: "returned", at: R } }
    expect(resolvePortraitMotion(input, R + W - 1)).toBe("beckon")
    expect(resolvePortraitMotion(input, R + W)).toBe("reading")
  })

  it("見えるようになった時刻が答え待ちより前なら、窓は答え待ちから数える", () => {
    const input: PortraitMotionInput = {
      ...IDLE,
      askedAt: A,
      tab: { kind: "returned", at: A - 1000 },
    }
    expect(resolvePortraitMotion(input, A + W)).toBe("reading")
  })

  it("答え待ちが無ければ、見えるようになっても呼ばない", () => {
    expect(resolvePortraitMotion({ ...RUNNING, tab: { kind: "returned", at: A } }, A + 1)).toBe(
      "waiting",
    )
  })

  it("送った直後はうなずき、期間を過ぎたら続く動きへ戻る", () => {
    const input: PortraitMotionInput = { ...RUNNING, sentAt: A }
    expect(resolvePortraitMotion(input, A + N - 1)).toBe("nod")
    expect(resolvePortraitMotion(input, A + N)).toBe("waiting")
  })

  it("呼ぶはうなずくより優先する", () => {
    expect(resolvePortraitMotion({ ...IDLE, askedAt: A, sentAt: A }, A + 1)).toBe("beckon")
  })

  it("跳ねる・びくっはうなずくより優先する", () => {
    const ended = {
      kind: "finished",
      startedAt: 0,
      finishedAt: A,
      ending: { kind: "ended" },
    } as const
    expect(resolvePortraitMotion({ ...IDLE, turn: ended, sentAt: A }, A + 1)).toBe("success")
    expect(resolvePortraitMotion({ ...RUNNING, lastToolFailureAt: A, sentAt: A }, A + 1)).toBe(
      "failure",
    )
  })

  it("動きを減らす設定では呼ばず、うなずかない", () => {
    const reduced = { ...IDLE, reducedMotion: true }
    expect(resolvePortraitMotion({ ...reduced, askedAt: A }, A + 1)).toBe("reading")
    expect(resolvePortraitMotion({ ...reduced, sentAt: A }, A + 1)).toBe("reading")
  })

  it("残り時間は、呼ぶ・うなずくの窓も数える。隠れているあいだと動きを減らす設定では数えない", () => {
    expect(nextPortraitMotionTransitionDelayMs({ ...IDLE, askedAt: A }, A + 1000)).toBe(W - 1000)
    expect(nextPortraitMotionTransitionDelayMs({ ...IDLE, sentAt: A }, A + 100)).toBe(N - 100)
    expect(nextPortraitMotionTransitionDelayMs({ ...IDLE, askedAt: A, sentAt: A }, A + 100)).toBe(
      N - 100,
    )
    expect(
      nextPortraitMotionTransitionDelayMs({ ...IDLE, askedAt: A, tab: { kind: "hidden" } }, A + 1),
    ).toBeUndefined()
    expect(
      nextPortraitMotionTransitionDelayMs({ ...IDLE, askedAt: A, reducedMotion: true }, A + 1),
    ).toBeUndefined()
  })
})

describe("nextPortraitMotionTransitionDelayMs", () => {
  it("完了も失敗も起きていなければ undefined", () => {
    const input: PortraitMotionInput = {
      turn: { kind: "idle" },
      lastToolFailureAt: undefined,
      draftingReport: false,
    }
    expect(nextPortraitMotionTransitionDelayMs(input, 0)).toBeUndefined()
  })

  it("期間をすでに過ぎていれば undefined", () => {
    const input: PortraitMotionInput = {
      turn: { kind: "finished", startedAt: 0, finishedAt: 0, ending: { kind: "ended" } },
      lastToolFailureAt: undefined,
      draftingReport: false,
    }
    expect(nextPortraitMotionTransitionDelayMs(input, SUCCESS_MOTION_WINDOW_MS)).toBeUndefined()
  })

  it("完了の反応の期間が残っていれば、その残り時間を返す", () => {
    const input: PortraitMotionInput = {
      turn: { kind: "finished", startedAt: 0, finishedAt: 1000, ending: { kind: "ended" } },
      lastToolFailureAt: undefined,
      draftingReport: false,
    }
    expect(nextPortraitMotionTransitionDelayMs(input, 1200)).toBe(SUCCESS_MOTION_WINDOW_MS - 200)
  })

  it("失敗の期間のほうが早く終わるなら、そちらの残り時間を返す", () => {
    const input: PortraitMotionInput = {
      turn: { kind: "finished", startedAt: 0, finishedAt: 1000, ending: { kind: "ended" } },
      lastToolFailureAt: 1000,
      draftingReport: false,
    }
    expect(nextPortraitMotionTransitionDelayMs(input, 1000)).toBe(FAILURE_MOTION_WINDOW_MS)
  })
})

describe("届いた瞬間の動き", () => {
  const T = 200_000
  const WINDOWS = {
    nod: 500,
    lean: 900,
    tilt: 900,
    sink: 1100,
    success: 700,
    failure: 400,
  } as const
  const RUNNING: PortraitMotionInput = {
    turn: { kind: "running", startedAt: 0 },
    lastToolFailureAt: undefined,
    draftingReport: false,
  }
  const IDLE: PortraitMotionInput = { ...RUNNING, turn: { kind: "idle" } }

  const CASES: readonly (readonly [ArrivalMotion, number])[] = [
    ["nod", WINDOWS.nod],
    ["lean", WINDOWS.lean],
    ["tilt", WINDOWS.tilt],
    ["sink", WINDOWS.sink],
    ["success", WINDOWS.success],
    ["failure", WINDOWS.failure],
  ]

  it.each(CASES)("%s は窓の内で出て、窓を過ぎたら続く動きへ戻る", (motion, w) => {
    const input: PortraitMotionInput = { ...RUNNING, arrival: { at: T, motion } }
    expect(resolvePortraitMotion(input, T + w - 1)).toBe(motion)
    expect(resolvePortraitMotion(input, T + w)).toBe("waiting")
  })

  it("呼ぶは届いた瞬間の動きより優先する", () => {
    const input: PortraitMotionInput = {
      ...IDLE,
      askedAt: T,
      arrival: { at: T, motion: "lean" },
    }
    expect(resolvePortraitMotion(input, T + 1)).toBe("beckon")
  })

  it("届いた瞬間の動きはうなずくより優先する", () => {
    const input: PortraitMotionInput = {
      ...IDLE,
      sentAt: T,
      arrival: { at: T, motion: "sink" },
    }
    expect(resolvePortraitMotion(input, T + 1)).toBe("sink")
  })

  it("跳ねる・びくっは届いた瞬間の動きより優先する", () => {
    const arrival = { at: T, motion: "lean" } as const
    const ended = {
      kind: "finished",
      startedAt: 0,
      finishedAt: T,
      ending: { kind: "ended" },
    } as const
    expect(resolvePortraitMotion({ ...IDLE, turn: ended, arrival }, T + 1)).toBe("success")
    expect(resolvePortraitMotion({ ...RUNNING, lastToolFailureAt: T, arrival }, T + 1)).toBe(
      "failure",
    )
  })

  it("動きを減らす設定では出さない", () => {
    const input: PortraitMotionInput = {
      ...IDLE,
      reducedMotion: true,
      arrival: { at: T, motion: "lean" },
    }
    expect(resolvePortraitMotion(input, T + 1)).toBe("reading")
    expect(nextPortraitMotionTransitionDelayMs(input, T + 1)).toBeUndefined()
  })

  it("残り時間は届いた瞬間の動きの窓も数える", () => {
    const input: PortraitMotionInput = { ...IDLE, arrival: { at: T, motion: "sink" } }
    expect(nextPortraitMotionTransitionDelayMs(input, T + 100)).toBe(WINDOWS.sink - 100)
    expect(nextPortraitMotionTransitionDelayMs({ ...input, sentAt: T }, T + 100)).toBe(
      WINDOWS.nod - 100,
    )
  })
})
