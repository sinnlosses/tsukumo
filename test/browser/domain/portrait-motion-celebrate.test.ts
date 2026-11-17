import { describe, expect, it } from "vitest"

import {
  isListeningPose,
  newestTurnFinishedTask,
  nextPortraitMotionTransitionDelayMs,
  resolvePortraitMotion,
  type PortraitMotionInput,
} from "../../../src/browser/domain/portrait-motion.ts"
import type { ReportCheck } from "../../../src/shared/report/report-check.ts"
import type { ReportTask } from "../../../src/shared/report/report-task.ts"
import { reportRecord, requestRecord, speechRecord } from "../../fixture/session-record.ts"

/** 祝う動きの窓。 */
const C = 1300
/** 跳ねる動きの窓。 */
const SUCCESS_WINDOW = 700
/** 閉じた時刻。 */
const F = 1000

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

function finished(extra: Partial<PortraitMotionInput> = {}): PortraitMotionInput {
  return { turn: ENDED, draftingReport: false, taskFinished: true, ...extra }
}

describe("祝う動きの解決", () => {
  it("窓の中は祝い、窓を過ぎたら続く動きへ戻る", () => {
    expect(resolvePortraitMotion(finished(), F + C - 1)).toBe("celebrate")
    expect(resolvePortraitMotion(finished(), F + C)).toBe("reading")
  })

  it("taskFinished を省く・偽なら今と同じ跳ねる", () => {
    for (const input of [
      finished({ taskFinished: undefined }),
      finished({ taskFinished: false }),
    ]) {
      expect(resolvePortraitMotion(input, F + SUCCESS_WINDOW - 1)).toBe("success")
      expect(resolvePortraitMotion(input, F + SUCCESS_WINDOW)).toBe("reading")
    }
  })

  it("背景の作業が残るあいだは祝わず待つ", () => {
    expect(resolvePortraitMotion(finished({ backgroundRunning: true }), F + 1)).toBe("waiting")
  })

  it("利用者が止めたときは祝わない", () => {
    expect(resolvePortraitMotion(finished({ interrupted: true }), F + 1)).toBe("reading")
  })

  it("失敗で閉じたときは祝わずびくっ", () => {
    expect(resolvePortraitMotion(finished({ turn: FAILED }), F + 1)).toBe("failure")
    expect(resolvePortraitMotion(finished({ turn: FAILED }), F + 400)).toBe("reading")
  })

  it("同じ時刻のツール失敗はびくっが勝つ", () => {
    expect(resolvePortraitMotion(finished({ lastToolFailureAt: F }), F + 1)).toBe("failure")
  })

  it("窓の中の呼ぶ・届いた瞬間・うなずくより祝うが勝つ", () => {
    expect(resolvePortraitMotion(finished({ askedAt: F }), F + 1)).toBe("celebrate")
    expect(resolvePortraitMotion(finished({ arrival: { at: F, motion: "lean" } }), F + 1)).toBe(
      "celebrate",
    )
    expect(resolvePortraitMotion(finished({ sentAt: F }), F + 1)).toBe("celebrate")
  })

  it("動きを減らす設定では祝わず跳ねるのまま", () => {
    const input = finished({ reducedMotion: true })
    expect(resolvePortraitMotion(input, F + 1)).toBe("success")
    expect(resolvePortraitMotion(input, F + SUCCESS_WINDOW)).toBe("reading")
  })

  it("閉じた時刻が窓より前なら動かない", () => {
    expect(resolvePortraitMotion(finished(), F + C + 60_000)).toBe("reading")
  })

  it("残り時間は祝うの窓で数え、動きを減らす設定では跳ねるの窓で数える", () => {
    expect(nextPortraitMotionTransitionDelayMs(finished(), F + 200)).toBe(C - 200)
    expect(nextPortraitMotionTransitionDelayMs(finished({ reducedMotion: true }), F + 200)).toBe(
      SUCCESS_WINDOW - 200,
    )
  })

  it("祝うあいだは聞く姿勢を取らない", () => {
    expect(isListeningPose("celebrate", true, false)).toBe(false)
  })
})

describe("newestTurnFinishedTask", () => {
  const FINISHED: ReportTask = {
    kind: "task",
    id: "T-1",
    name: "架空",
    outcome: "finished",
    genre: "unspecified",
  }
  const check = (status: ReportCheck["status"]): ReportCheck => ({
    status,
    label: "架空",
    figure: "",
    command: "",
    detail: "",
    howToVerify: "",
  })

  it("finished のタスクなら真。checks が空でも ok・unobserved・blocked でも真", () => {
    expect(newestTurnFinishedTask([requestRecord(), reportRecord("a", { task: FINISHED })])).toBe(
      true,
    )
    const checks = [check("ok"), check("unobserved"), check("blocked")]
    expect(
      newestTurnFinishedTask([requestRecord(), reportRecord("a", { task: FINISHED, checks })]),
    ).toBe(true)
  })

  it("ng が1行あれば偽", () => {
    const checks = [check("ok"), check("ng")]
    expect(
      newestTurnFinishedTask([requestRecord(), reportRecord("a", { task: FINISHED, checks })]),
    ).toBe(false)
  })

  it("task が無い・outcome が finished でないなら偽", () => {
    expect(newestTurnFinishedTask([requestRecord(), reportRecord("a")])).toBe(false)
    for (const outcome of ["stopped", "awaiting-answer"] as const) {
      expect(
        newestTurnFinishedTask([
          requestRecord(),
          reportRecord("a", { task: { ...FINISHED, outcome } }),
        ]),
      ).toBe(false)
    }
  })

  it("report が無い・記録が空なら偽", () => {
    expect(newestTurnFinishedTask([requestRecord(), speechRecord()])).toBe(false)
    expect(newestTurnFinishedTask([])).toBe(false)
  })

  it("最後の report で決める", () => {
    expect(
      newestTurnFinishedTask([
        requestRecord(),
        reportRecord("a", { task: FINISHED }),
        reportRecord("b"),
      ]),
    ).toBe(false)
  })

  it("前のやり取りの report は見ない", () => {
    expect(
      newestTurnFinishedTask([
        requestRecord(),
        reportRecord("a", { task: FINISHED }),
        requestRecord(),
      ]),
    ).toBe(false)
  })
})
