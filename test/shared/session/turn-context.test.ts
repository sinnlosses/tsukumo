import { describe, expect, it } from "vitest"

import type { SessionRecord } from "../../../src/shared/session/session-record.ts"
import {
  advanceTurnContext,
  bashCommandRuns,
  EMPTY_TURN_CONTEXT,
  type TurnContext,
} from "../../../src/shared/session/turn-context.ts"
import { requestRecord, toolRecord } from "../../fixture/session-record.ts"

const fold = (records: readonly SessionRecord[]): TurnContext =>
  records.reduce<TurnContext>(
    (context, record) => advanceTurnContext(context, record),
    EMPTY_TURN_CONTEXT,
  )

const bash = (id: string, command: string): SessionRecord =>
  toolRecord({ toolUseId: id, input: { command } })

describe("bashCommandRuns", () => {
  it("同じやり取りで同じコマンドを打った回数を数え、打っていないコマンドは 0", () => {
    const context = fold([bash("a", "架空の検査"), bash("b", "架空の検査"), bash("c", "架空の別")])

    expect(bashCommandRuns(context, "架空の検査")).toBe(2)
    expect(bashCommandRuns(context, "架空の別")).toBe(1)
    expect(bashCommandRuns(context, "架空の未実行")).toBe(0)
  })

  it("新しい依頼で数え直す", () => {
    const context = fold([bash("a", "架空の検査"), requestRecord(), bash("b", "架空の検査")])

    expect(bashCommandRuns(context, "架空の検査")).toBe(1)
  })
})
