import { describe, expect, it } from "vitest"

import { mainViewEntries } from "../../../src/shared/session/main-view-entry.ts"
import { mainViewTurns } from "../../../src/shared/session/main-view.ts"
import type { SessionEvent } from "../../../src/shared/session/session-event.ts"
import { applySessionEvent } from "../../../src/shared/session/session-fold.ts"
import { MAX_SESSION_STATE_TURNS } from "../../../src/shared/session/session-record.ts"
import { reportEvent } from "../../fixture/report-event.ts"
import { apply } from "../../fixture/session-state.ts"

/** メインビューに出すやり取りの数（仕事の記録の窓と同じ）。 */
const MAX_MAIN_VIEW_TURNS = MAX_SESSION_STATE_TURNS.work

describe("applySessionEvent", () => {
  it("記録はターン数の窓（直近20ターン）だけを残し、古いターンは落とす", () => {
    const events: SessionEvent[] = []
    for (let turn = 0; turn < 25; turn += 1) {
      events.push({ kind: "request", text: `依頼${String(turn)}`, images: [] })
      events.push({ kind: "utterance", text: `レポート${String(turn)}` })
    }

    const view = apply(...events)
    const requestTexts = mainViewEntries(view)
      .filter((entry) => entry.kind === "request")
      .map((entry) => entry.text)

    expect(requestTexts).toHaveLength(20)
    expect(requestTexts[0]).toBe("依頼5")
    expect(requestTexts.at(-1)).toBe("依頼24")
  })

  it("雑談モードでは窓が100ターンに広がる（仕事の20ターンより後ろまで残る）", () => {
    const events: SessionEvent[] = [{ kind: "chat-mode-changed", chat: true }]
    for (let turn = 0; turn < 105; turn += 1) {
      events.push({ kind: "request", text: `依頼${String(turn)}`, images: [] })
      events.push({ kind: "utterance", text: `雑談${String(turn)}` })
    }

    const view = apply(...events)
    const requestTexts = mainViewEntries(view)
      .filter((entry) => entry.kind === "request")
      .map((entry) => entry.text)

    expect(requestTexts).toHaveLength(100)
    expect(requestTexts[0]).toBe("依頼5")
    expect(requestTexts.at(-1)).toBe("依頼104")
  })

  it("窓がいっぱいになっても、ターンの通し番号は止まらずに増え続ける", () => {
    // 番号を位置で決めていたころは、窓（20ターン）を超えるといちばん新しいターンの番号が
    // 19 で止まり、描く側が `key` に使っているせいで部品が作り直されず、書き上げる演出が
    // 二度と起動しなかった（`useReportReveal`）。
    const events: SessionEvent[] = []
    for (let turn = 0; turn < 25; turn += 1) {
      events.push({ kind: "request", text: `依頼${String(turn)}`, images: [] })
      events.push({ kind: "utterance", text: `本文${String(turn)}` })
      events.push({ kind: "turn-finished", outcome: { kind: "completed" } })
    }

    const view = apply(...events)
    const turns = mainViewTurns(mainViewEntries(view), { report: false, utterance: false }, true)

    expect(turns.at(-1)?.id).toBe(24)
    expect(turns.map((turn) => turn.id)).toEqual(
      Array.from({ length: MAX_MAIN_VIEW_TURNS }, (_, index) => 25 - MAX_MAIN_VIEW_TURNS + index),
    )
  })

  it("圧縮の区切り（compact-boundary）を挟んでも、窓の数え方（request の数）は変わらない", () => {
    const events: SessionEvent[] = []
    for (let turn = 0; turn < 25; turn += 1) {
      events.push({ kind: "request", text: `依頼${String(turn)}`, images: [] })
      if (turn === 10) {
        events.push({ kind: "compact-boundary" })
      }
    }

    const view = apply(...events)
    const requestTexts = view.records
      .filter((record) => record.kind === "request")
      .map((record) => record.text)

    expect(requestTexts).toHaveLength(20)
    expect(requestTexts[0]).toBe("依頼5")
    expect(requestTexts.at(-1)).toBe("依頼24")
  })
})

describe("applySessionEvent（変更の札）", () => {
  const REQUEST: SessionEvent = { kind: "request", text: "架空の依頼", images: [] }
  const COUNTED: SessionEvent = {
    kind: "report-change-summary",
    toolUseId: "toolu_r1",
    files: 2,
    added: 10,
    removed: 4,
    mixed: true,
  }

  it("report の記録は札が none で積まれ、同じ toolUseId の report-change-summary で数に差し替わる", () => {
    const reported = apply(REQUEST, reportEvent({ toolUseId: "toolu_r1" }))
    expect(reported.records.at(-1)).toMatchObject({ changeSummary: { kind: "none" } })

    expect(
      apply(REQUEST, reportEvent({ toolUseId: "toolu_r1" }), COUNTED).records.at(-1),
    ).toMatchObject({
      kind: "report",
      changeSummary: { kind: "counted", files: 2, added: 10, removed: 4, mixed: true },
    })
  })

  it("知らない toolUseId の report-change-summary では姿を変えない", () => {
    const reported = apply(REQUEST, reportEvent({ toolUseId: "toolu_other" }))

    expect(applySessionEvent(reported, COUNTED, 0)).toBe(reported)
  })
})
