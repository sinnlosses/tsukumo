import { describe, expect, it } from "bun:test"

import {
  FAILURE_MOTION_WINDOW_MS,
  nextPortraitMotionTransitionDelayMs,
  resolvePortraitMotion,
  SUCCESS_MOTION_WINDOW_MS,
  type PortraitMotionInput,
} from "../../src/shared/portrait-motion.ts"

describe("resolvePortraitMotion", () => {
  it("ターンが進行中でなく、直近の完了・失敗も無ければ「読んでいる」（呼吸だけ）", () => {
    const input: PortraitMotionInput = {
      turn: { kind: "idle" },
      lastToolFailureAt: undefined,
    }
    expect(resolvePortraitMotion(input, 0)).toBe("reading")
  })

  it("ターンが進行中なら「待っている」（領域の中を歩く）", () => {
    const input: PortraitMotionInput = {
      turn: { kind: "running", startedAt: 0 },
      lastToolFailureAt: undefined,
    }
    expect(resolvePortraitMotion(input, 0)).toBe("waiting")
  })

  it("ターンが終わった直後（窓の内）は「完了の反応」", () => {
    const input: PortraitMotionInput = {
      turn: { kind: "finished", startedAt: 0, finishedAt: 1000 },
      lastToolFailureAt: undefined,
    }
    expect(resolvePortraitMotion(input, 1000 + SUCCESS_MOTION_WINDOW_MS - 1)).toBe("success")
  })

  it("完了の反応の窓を過ぎたら「読んでいる」に戻る", () => {
    const input: PortraitMotionInput = {
      turn: { kind: "finished", startedAt: 0, finishedAt: 1000 },
      lastToolFailureAt: undefined,
    }
    expect(resolvePortraitMotion(input, 1000 + SUCCESS_MOTION_WINDOW_MS)).toBe("reading")
  })

  it("ツールが失敗した直後（窓の内）は「失敗でびくっ」", () => {
    const input: PortraitMotionInput = {
      turn: { kind: "running", startedAt: 0 },
      lastToolFailureAt: 2000,
    }
    expect(resolvePortraitMotion(input, 2000 + FAILURE_MOTION_WINDOW_MS - 1)).toBe("failure")
  })

  it("失敗の窓を過ぎたら、ターンが進行中のままなら「待っている」へ戻る", () => {
    const input: PortraitMotionInput = {
      turn: { kind: "running", startedAt: 0 },
      lastToolFailureAt: 2000,
    }
    expect(resolvePortraitMotion(input, 2000 + FAILURE_MOTION_WINDOW_MS)).toBe("waiting")
  })

  it("失敗はターンが進行中でも完了の反応より優先する", () => {
    const input: PortraitMotionInput = {
      turn: { kind: "finished", startedAt: 0, finishedAt: 1000 },
      lastToolFailureAt: 1000,
    }
    expect(resolvePortraitMotion(input, 1000 + 1)).toBe("failure")
  })
})

describe("nextPortraitMotionTransitionDelayMs", () => {
  it("完了も失敗も起きていなければ undefined", () => {
    const input: PortraitMotionInput = {
      turn: { kind: "idle" },
      lastToolFailureAt: undefined,
    }
    expect(nextPortraitMotionTransitionDelayMs(input, 0)).toBeUndefined()
  })

  it("窓をすでに過ぎていれば undefined", () => {
    const input: PortraitMotionInput = {
      turn: { kind: "finished", startedAt: 0, finishedAt: 0 },
      lastToolFailureAt: undefined,
    }
    expect(nextPortraitMotionTransitionDelayMs(input, SUCCESS_MOTION_WINDOW_MS)).toBeUndefined()
  })

  it("完了の反応の窓が残っていれば、その残り時間を返す", () => {
    const input: PortraitMotionInput = {
      turn: { kind: "finished", startedAt: 0, finishedAt: 1000 },
      lastToolFailureAt: undefined,
    }
    expect(nextPortraitMotionTransitionDelayMs(input, 1200)).toBe(SUCCESS_MOTION_WINDOW_MS - 200)
  })

  it("失敗の窓のほうが早く終わるなら、そちらの残り時間を返す", () => {
    const input: PortraitMotionInput = {
      turn: { kind: "finished", startedAt: 0, finishedAt: 1000 },
      lastToolFailureAt: 1000,
    }
    expect(nextPortraitMotionTransitionDelayMs(input, 1000)).toBe(FAILURE_MOTION_WINDOW_MS)
  })
})
