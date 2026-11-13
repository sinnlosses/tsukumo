import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { INITIAL_SESSION_STATE } from "../../../../../../../src/shared/session/session-state.ts"
import { requestRecord, workPlanRecord } from "../../../../../../fixture/session-record.ts"
import { turn } from "../../../../../../fixture/turn.ts"
import { putSession } from "../../../../../session-store.ts"

// 本物の `Report` は重いので、何も描かない代役に差し替える。
vi.mock("../../../../../../../src/browser/features/report/report.tsx", () => ({
  Report: () => <div />,
}))

const { Turn } =
  await import("../../../../../../../src/browser/components/page/conversation/components/main-view/turn.tsx")

afterEach(() => {
  cleanup()
})

const FAILED = {
  ...turn([]),
  failure: { kind: "failed", failure: { kind: "max-turns" } },
} as const

describe("Turn の失敗の枠と紙", () => {
  it("紙の計画が失敗を出すときは頭の枠を外す", () => {
    putSession({ ...INITIAL_SESSION_STATE, records: [requestRecord(), workPlanRecord()] })
    render(<Turn turn={FAILED} newest freshReport={false} failure="paper" />)

    expect(screen.queryByRole("note", { name: "失敗で終わった" })).toBeNull()
  })

  it("計画が無ければ、紙に任せる指定でも枠を残す", () => {
    putSession(INITIAL_SESSION_STATE)
    render(<Turn turn={FAILED} newest freshReport={false} failure="paper" />)

    expect(screen.getByRole("note", { name: "失敗で終わった" })).toBeTruthy()
  })
})
