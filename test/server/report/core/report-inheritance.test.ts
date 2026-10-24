import { describe, expect, it } from "vitest"

import { createReportInheritance } from "../../../../src/server/report/core/report-inheritance.ts"
import type { ReportArgumentField } from "../../../../src/shared/report/report-argument-size.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import { reportEvent } from "../../../fixture/report-event.ts"
import { requestEvent } from "../../../fixture/session-event.ts"

type ReportCalled = Extract<SessionEvent, { kind: "report" }>

const finished = (toolUseId: string, isError: boolean): SessionEvent => ({
  kind: "tool-finished",
  toolUseId,
  content: isError ? "架空の差し戻し" : "ok",
  isError,
})

/** 渡した欄だけを `argumentChars.fields` に載せた `report`。 */
const called = (
  toolUseId: string,
  passed: readonly ReportArgumentField[],
  values: Partial<Omit<ReportCalled, "kind">> = {},
): ReportCalled =>
  reportEvent({
    toolUseId,
    argumentChars: { total: 10, fields: Object.fromEntries(passed.map((field) => [field, 1])) },
    ...values,
  })

const CLOSING = { kind: "speech", text: "架空の締め", expression: "default" } as const
const WAITING = { kind: "speech", text: "架空の待ちの一言", expression: "default" } as const
const CHECK = {
  status: "ok",
  label: "架空の検査",
  figure: "",
  command: "",
  detail: "",
  howToVerify: "",
} as const

const REJECTED = called(
  "toolu_r1",
  ["conclusion", "favor", "checks", "title", "sessionSummary", "closing", "waitingLine"],
  {
    conclusion: "架空の差し戻された結論",
    favor: "架空のお願い",
    checks: [CHECK],
    sessionSummary: "架空の要約",
    closing: CLOSING,
    waitingLine: WAITING,
  },
)

/** 差し戻しの1回を流し終えた段を返す。 */
function afterRejection(): ReturnType<typeof createReportInheritance> {
  const inheritance = createReportInheritance()
  inheritance.pass(REJECTED)
  inheritance.pass(finished("toolu_r1", true))
  return inheritance
}

describe("ReportInheritance", () => {
  it("差し戻しのあとの呼び出しは、渡さなかった欄を差し戻した値で埋め、その名前を inheritedFields に入れる", () => {
    const inheritance = afterRejection()

    expect(
      inheritance.pass(called("toolu_r2", ["conclusion"], { conclusion: "架空の直した結論" })),
    ).toEqual(
      called("toolu_r2", ["conclusion"], {
        conclusion: "架空の直した結論",
        favor: "架空のお願い",
        checks: [CHECK],
        sessionSummary: "架空の要約",
        closing: CLOSING,
        waitingLine: WAITING,
        inheritedFields: ["favor", "checks", "title", "sessionSummary", "closing", "waitingLine"],
      }),
    )
  })

  it("空の値を渡した欄は引き継がずに上書きする", () => {
    const inheritance = afterRejection()
    const resent = called("toolu_r2", ["favor", "checks"], {
      conclusion: "",
      favor: "",
      checks: [],
    })

    expect(inheritance.pass(resent)).toMatchObject({
      conclusion: "架空の差し戻された結論",
      favor: "",
      checks: [],
      inheritedFields: ["conclusion", "title", "sessionSummary", "closing", "waitingLine"],
    })
  })

  it("差し戻しが続けば、土台はいちばん新しい差し戻しの埋めたあとの姿になる", () => {
    const inheritance = afterRejection()
    inheritance.pass(
      called("toolu_r2", ["favor"], { conclusion: "", favor: "架空の二度目のお願い" }),
    )
    inheritance.pass(finished("toolu_r2", true))

    expect(inheritance.pass(called("toolu_r3", ["checks"], { conclusion: "" }))).toMatchObject({
      conclusion: "架空の差し戻された結論",
      favor: "架空の二度目のお願い",
      checks: [],
      inheritedFields: ["conclusion", "favor", "title", "sessionSummary", "closing", "waitingLine"],
    })
  })

  it("土台が無ければ report をそのまま返す", () => {
    const inheritance = createReportInheritance()
    const report = called("toolu_r1", ["favor"], { conclusion: "", favor: "架空のお願い" })

    expect(inheritance.pass(report)).toEqual(report)
  })

  it("fill は pass と同じ値で埋め、預からず土台も変えない", () => {
    const inheritance = afterRejection()
    const resent = called("toolu_r2", ["conclusion"], { conclusion: "架空の直した結論" })

    const filled = inheritance.fill(resent)
    inheritance.pass(finished("toolu_r2", false))

    expect(inheritance.pass(resent)).toEqual(filled)
    expect(filled.favor).toBe("架空のお願い")
  })

  const boundaries: Readonly<Record<string, SessionEvent>> = {
    "受け付けた（isError でない）結果": finished("toolu_r2", false),
    "ターンの頭（session-info）": {
      kind: "session-info",
      sessionId: "架空のセッション",
      model: undefined,
      permissionMode: undefined,
      slashCommands: [],
      terminalSlashCommands: [],
      skillNames: [],
      agentNames: [],
    },
    "ターンの頭（turn-started）": { kind: "turn-started" },
    "ターンの頭（turn-resumed）": { kind: "turn-resumed" },
    "ターンの終わり（turn-finished）": { kind: "turn-finished", outcome: { kind: "completed" } },
    "利用者の依頼（request）": requestEvent(),
    "脇の話（aside）": { kind: "aside", text: "架空の問い", images: [] },
  }

  it.each(Object.entries(boundaries))("%s で土台を捨てる", (_name, boundary) => {
    const inheritance = afterRejection()
    inheritance.pass(called("toolu_r2", ["conclusion"], { conclusion: "架空の直した結論" }))
    inheritance.pass(boundary)
    const next = called("toolu_r3", ["conclusion"], { conclusion: "架空の次の結論" })

    expect(inheritance.pass(next)).toEqual(next)
  })
})
