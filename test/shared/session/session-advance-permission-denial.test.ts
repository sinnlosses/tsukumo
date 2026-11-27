import { describe, expect, it } from "vitest"

import type { PermissionDenial } from "../../../src/shared/session-driver/permission-denial.ts"
import type { SessionEvent } from "../../../src/shared/session/session-event.ts"
import { applySessionEvent } from "../../../src/shared/session/session-fold.ts"
import { INITIAL_SESSION_STATE } from "../../../src/shared/session/session-state.ts"

const MAIN_DENIAL: PermissionDenial = {
  toolUseId: "toolu_denied_1",
  toolName: "Bash",
  reason: "Classifier unavailable",
}

const OTHER_DENIAL: PermissionDenial = {
  toolUseId: "toolu_denied_2",
  toolName: "Write",
  reason: "架空の理由",
}

function foldAt(...stamped: readonly (readonly [SessionEvent, number])[]) {
  return stamped.reduce(
    (state, [event, at]) => applySessionEvent(state, event, at),
    INITIAL_SESSION_STATE,
  )
}

describe("自動判定の拒否の畳み込み", () => {
  it("拒否は届いた順に、届いた時刻つきで積む", () => {
    const state = foldAt(
      [{ kind: "permission-denied", denial: MAIN_DENIAL }, 100],
      [{ kind: "permission-denied", denial: OTHER_DENIAL }, 200],
    )

    expect(state.permissionDenials).toEqual([
      { ...MAIN_DENIAL, deniedAt: 100 },
      { ...OTHER_DENIAL, deniedAt: 200 },
    ])
  })

  it("同じ id の拒否がもう一度届いたら置き換え、2件にしない", () => {
    const state = foldAt(
      [{ kind: "permission-denied", denial: MAIN_DENIAL }, 100],
      [{ kind: "permission-denied", denial: { ...MAIN_DENIAL, reason: "別の理由" } }, 300],
    )

    expect(state.permissionDenials).toEqual([{ ...MAIN_DENIAL, reason: "別の理由", deniedAt: 300 }])
  })

  it("下げた拒否だけを並びから外す", () => {
    const state = foldAt(
      [{ kind: "permission-denied", denial: MAIN_DENIAL }, 100],
      [{ kind: "permission-denied", denial: OTHER_DENIAL }, 200],
      [{ kind: "permission-denial-settled", toolUseId: MAIN_DENIAL.toolUseId }, 300],
    )

    expect(state.permissionDenials.map((denial) => denial.toolUseId)).toEqual([
      OTHER_DENIAL.toolUseId,
    ])
  })

  it("セッションが終わったら並びを空にする", () => {
    const state = foldAt(
      [{ kind: "permission-denied", denial: MAIN_DENIAL }, 100],
      [{ kind: "session-ended", reason: "架空の終わり" }, 200],
    )

    expect(state.permissionDenials).toEqual([])
  })
})
