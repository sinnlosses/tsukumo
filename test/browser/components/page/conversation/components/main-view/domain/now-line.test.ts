import { describe, expect, it } from "vitest"

import type { NowLineStatement } from "../../../../../../../../src/browser/components/page/conversation/components/main-view/domain/now-line-statement.ts"
import {
  nowLineOf,
  type NowLineSource,
} from "../../../../../../../../src/browser/components/page/conversation/components/main-view/domain/now-line.ts"

const QUIET = {
  kind: "doing",
  verb: "考えている",
  target: "",
  mono: false,
  elapsed: "",
  remark: "",
  longRunning: false,
  retryDetail: "",
} as const satisfies NowLineStatement

const WORKING: NowLineSource = {
  contentKind: "work",
  turnStepListKind: "turn",
  viewingPast: false,
  activity: QUIET,
}

describe("nowLineOf", () => {
  it("働くあいだで字の色が quiet なら出す", () => {
    expect(nowLineOf(WORKING)).toEqual({ kind: "shown", activity: QUIET })
  })

  it("答え待ちなら出さない", () => {
    expect(nowLineOf({ ...WORKING, activity: { kind: "asking" } })).toEqual({
      kind: "none",
    })
  })

  it.each(["report", "welcome"] as const)("中身が %s なら出さない", (contentKind) => {
    expect(nowLineOf({ ...WORKING, contentKind })).toEqual({ kind: "none" })
  })

  it("やり取りの手順の一覧が無ければ出さない", () => {
    expect(nowLineOf({ ...WORKING, turnStepListKind: "none" })).toEqual({ kind: "none" })
  })

  it("過去のやり取りを見ているあいだは出さない", () => {
    expect(nowLineOf({ ...WORKING, viewingPast: true })).toEqual({ kind: "none" })
  })
})
