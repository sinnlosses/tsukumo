import { describe, expect, it } from "vitest"

import {
  endingManpuOf,
  resolvePortraitMotion,
  type PortraitMotionInput,
} from "../../../src/browser/domain/portrait-motion.ts"

/** 閉じた・失敗した・答え待ちが始まった時刻。 */
const F = 1000
/** 漫符を出す窓。 */
const WINDOW = 3000

const ENDED = {
  kind: "finished",
  startedAt: 0,
  finishedAt: F,
  ending: { kind: "ended" },
} satisfies PortraitMotionInput["turn"]

const FAILED = {
  kind: "finished",
  startedAt: 0,
  finishedAt: F,
  ending: { kind: "failed", failure: { kind: "api-error", error: "overloaded" } },
} satisfies PortraitMotionInput["turn"]

const RUNNING = { kind: "running", startedAt: 0 } satisfies PortraitMotionInput["turn"]

describe("終わり方の漫符", () => {
  it("タスクの完了で閉じたら星が出て、窓を過ぎたら消える", () => {
    const input = { turn: ENDED, taskFinished: true }
    expect(endingManpuOf(input, F + WINDOW - 1)).toEqual({ kind: "shown", manpu: "stars", at: F })
    expect(endingManpuOf(input, F + WINDOW)).toEqual({ kind: "none" })
  })

  it("タスクの完了でなければ星は出ない", () => {
    expect(endingManpuOf({ turn: ENDED }, F + 1)).toEqual({ kind: "none" })
  })

  it("失敗で終わったターンとツールの失敗では稲妻が出る", () => {
    expect(endingManpuOf({ turn: FAILED }, F + 1)).toEqual({
      kind: "shown",
      manpu: "shock",
      at: F,
    })
    expect(endingManpuOf({ turn: RUNNING, lastToolFailureAt: F }, F + 1)).toEqual({
      kind: "shown",
      manpu: "shock",
      at: F,
    })
  })

  it("あわわのセリフが届いた瞬間の failure の動きでは稲妻が出ない", () => {
    const input = {
      turn: RUNNING,
      arrival: { at: F, motion: "failure" },
    } satisfies Partial<PortraitMotionInput>
    expect(resolvePortraitMotion({ ...input, draftingReport: false }, F + 1)).toBe("failure")
    expect(endingManpuOf(input, F + 1)).toEqual({ kind: "none" })
  })

  it("答え待ちが始まったら「？」が出る。隠れているあいだは出ず、見えるようになった時刻から数え直す", () => {
    const asked = { turn: RUNNING, askedAt: F }
    expect(endingManpuOf(asked, F + 1)).toEqual({ kind: "shown", manpu: "ask", at: F })
    expect(endingManpuOf({ ...asked, tab: { kind: "hidden" } }, F + 1)).toEqual({ kind: "none" })
    expect(endingManpuOf({ ...asked, tab: { kind: "returned", at: F + 5000 } }, F + 5001)).toEqual({
      kind: "shown",
      manpu: "ask",
      at: F + 5000,
    })
  })

  it("動きを減らす設定ではどれも出ない", () => {
    expect(endingManpuOf({ turn: FAILED, reducedMotion: true }, F + 1)).toEqual({ kind: "none" })
    expect(endingManpuOf({ turn: RUNNING, askedAt: F, reducedMotion: true }, F + 1)).toEqual({
      kind: "none",
    })
    expect(endingManpuOf({ turn: ENDED, taskFinished: true, reducedMotion: true }, F + 1)).toEqual({
      kind: "none",
    })
  })
})
