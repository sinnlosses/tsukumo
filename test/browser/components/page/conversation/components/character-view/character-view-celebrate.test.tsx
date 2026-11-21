import { cleanup } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { nowEpochMilliseconds } from "../../../../../../../src/browser/utils/clock.ts"
import type { ReportCheck } from "../../../../../../../src/shared/report/report-check.ts"
import type { ReportTask } from "../../../../../../../src/shared/report/report-task.ts"
import type { SessionState } from "../../../../../../../src/shared/session/session-state.ts"
import {
  FIXTURE_CHARACTER,
  renderCharacterView,
} from "../../../../../../fixture/character-view.tsx"
import { reportRecord, requestRecord } from "../../../../../../fixture/session-record.ts"
import { stubPhoneWidth } from "../../../../../phone-width.ts"

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.location.hash = ""
})

const FINISHED_TASK: ReportTask = {
  kind: "task",
  id: "T-1",
  name: "架空のタスク",
  outcome: "finished",
  genre: "unspecified",
}

const NG_CHECK: ReportCheck = {
  status: "ng",
  label: "架空",
  figure: "",
  command: "",
  detail: "架空の理由",
  howToVerify: "",
}

/** 完了で閉じた姿。`closedAgoMs` は閉じてからの経過。 */
function closed(report: ReturnType<typeof reportRecord>, closedAgoMs = 0): Partial<SessionState> {
  const finishedAt = nowEpochMilliseconds() - closedAgoMs
  return {
    turn: { kind: "finished", startedAt: finishedAt - 100, finishedAt, ending: { kind: "ended" } },
    records: [requestRecord({ turnId: 0 }), report],
    character: FIXTURE_CHARACTER,
  }
}

const sparks = (): NodeListOf<Element> => document.querySelectorAll('[data-manpu="stars"]')
const stageMotion = (): string | null | undefined =>
  document.querySelector("[data-character-stage] [data-motion]")?.getAttribute("data-motion")

describe("CharacterView（祝光）", () => {
  it("完了で閉じ、最後の report が finished のタスクなら、祝う動きとともに祝光が1つ出る", () => {
    renderCharacterView(closed(reportRecord("架空", { task: FINISHED_TASK })))

    expect(sparks()).toHaveLength(1)
    expect(sparks()[0]?.getAttribute("aria-hidden")).toBe("true")
    expect(stageMotion()).toBe("celebrate")
  })

  it("祝光は光の星5つと花びら20枚で、普段のエフェクトのように控えめにせず1回だけ出る。動きを減らす設定では出ない", () => {
    renderCharacterView(closed(reportRecord("架空", { task: FINISHED_TASK })))

    expect(sparks()).toHaveLength(1)
    expect(sparks()[0]?.getAttribute("data-calm")).toBe("false")
    expect(sparks()[0]?.querySelectorAll("svg")).toHaveLength(5)
    expect(sparks()[0]?.querySelectorAll("[data-color]")).toHaveLength(20)
    cleanup()

    stubPhoneWidth(true)
    renderCharacterView(closed(reportRecord("架空", { task: FINISHED_TASK })))
    expect(document.querySelector('[data-manpu="stars"]')).toBeNull()
  })

  it("task の無い report（短い答え）には光が無く、跳ねる", () => {
    renderCharacterView(closed(reportRecord("架空")))

    expect(sparks()).toHaveLength(0)
    expect(stageMotion()).toBe("success")
  })

  it("checks に ng があるなら光が無く、跳ねる", () => {
    renderCharacterView(closed(reportRecord("架空", { task: FINISHED_TASK, checks: [NG_CHECK] })))

    expect(sparks()).toHaveLength(0)
    expect(stageMotion()).toBe("success")
  })

  it("動きを減らす設定では光が無い", () => {
    stubPhoneWidth(true)
    renderCharacterView(closed(reportRecord("架空", { task: FINISHED_TASK })))

    expect(sparks()).toHaveLength(0)
  })

  it("閉じた時刻が窓より前（復元した記録）では光が無い。過去のやり取りを選んでも無い", () => {
    const restored = closed(reportRecord("架空", { task: FINISHED_TASK }), 60_000)
    renderCharacterView(restored)
    expect(sparks()).toHaveLength(0)
    cleanup()

    renderCharacterView(restored, 0)
    expect(sparks()).toHaveLength(0)
  })

  it("立ち絵の素材が無ければ光が無い", () => {
    renderCharacterView({
      ...closed(reportRecord("架空", { task: FINISHED_TASK })),
      character: undefined,
    })

    expect(sparks()).toHaveLength(0)
  })
})
