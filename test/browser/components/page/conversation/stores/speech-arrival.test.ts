import { beforeEach, describe, expect, it } from "vitest"

import { useSpeechArrival } from "../../../../../../src/browser/components/page/conversation/stores/speech-arrival.ts"
import { nowEpochMilliseconds } from "../../../../../../src/browser/utils/clock.ts"
import type { SessionRecord } from "../../../../../../src/shared/session/session-record.ts"
import { requestRecord, speechRecord } from "../../../../../fixture/session-record.ts"
import { advanceState, putSession, putState, stateWith } from "../../../../session-store.ts"

function stateWithRecords(...records: SessionRecord[]) {
  return stateWith({ records })
}

const BASE = [requestRecord({ turnId: 0 }), speechRecord({ text: "1件目" })]

describe("useSpeechArrival", () => {
  beforeEach(() => {
    putSession(stateWithRecords(...BASE))
  })

  it("声のある姿を入れた直後（画面を開いた直後）は無い", () => {
    expect(useSpeechArrival.getState().arrival.kind).toBe("none")
  })

  it("声が1件増えると、届いた（時刻は今）", () => {
    const before = nowEpochMilliseconds()
    advanceState(stateWithRecords(...BASE, speechRecord({ text: "2件目", expression: "thinking" })))
    const { arrival } = useSpeechArrival.getState()
    expect(arrival).toMatchObject({
      kind: "arrived",
      turnId: 0,
      index: 1,
      expression: "thinking",
    })
    expect(arrival.kind === "arrived" && arrival.at >= before).toBe(true)
  })

  it("届いたあと、声の多い姿へ丸ごと入れ替えると（復元）無い", () => {
    advanceState(stateWithRecords(...BASE, speechRecord({ text: "2件目" })))
    putState(stateWithRecords(...BASE, speechRecord({ text: "2件目" }), speechRecord()))
    expect(useSpeechArrival.getState().arrival.kind).toBe("none")
  })
})
