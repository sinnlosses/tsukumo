import { describe, expect, it } from "vitest"

import { reportBodyChars } from "../../../../src/server/usage/core/report-body-length.ts"
import type { ReportBlock } from "../../../../src/shared/report/report-block.ts"
import { applySessionEvent } from "../../../../src/shared/session/session-fold.ts"
import { INITIAL_SESSION_STATE } from "../../../../src/shared/session/session-state.ts"
import { reportOfDrawn } from "../../../fixture/report-event.ts"

type Drawn = Parameters<typeof reportOfDrawn>[0]

function charsOf(drawn: Drawn): number {
  const state = applySessionEvent(INITIAL_SESSION_STATE, reportOfDrawn(drawn), 0)
  const report = state.records.findLast((record) => record.kind === "report")
  return report === undefined ? -1 : reportBodyChars(report)
}

const text = (value: string, fold = "", aside = ""): ReportBlock => ({
  kind: "text",
  text: value,
  fold,
  aside,
})

const table = (rows: readonly (readonly string[])[]): ReportBlock => ({
  kind: "table",
  title: "題",
  columns: ["列", "値"],
  rows,
  rest: "",
  fold: "",
  aside: "",
})

describe("reportBodyChars", () => {
  it("見出しの字と本文の字を足す", () => {
    expect(charsOf({ sections: [{ heading: " 見出し ", blocks: [text("本文本文")] }] })).toBe(7)
  })

  it("部品の無い記録は 0", () => {
    expect(charsOf({ sections: [] })).toBe(0)
  })

  it("振り返りの字は数えない", () => {
    const base = { sections: [{ heading: "", blocks: [text("本文")] }] }
    expect(
      charsOf({
        ...base,
        retrospective: {
          kind: "recorded",
          summary: "とても長い振り返りの要約です。",
          drafts: [],
          blocks: [text("振り返りの本文")],
        },
      }),
    ).toBe(charsOf(base))
  })

  it("整形で落ちる定型の段落は数えない", () => {
    expect(
      charsOf({
        sections: [
          { heading: "", blocks: [text("本文")] },
          { heading: "", blocks: [text("以上です")] },
        ],
      }),
    ).toBe(2)
  })

  it("fold と aside の字も数える", () => {
    expect(charsOf({ sections: [{ heading: "", blocks: [text("あ", "いい", "ううう")] }] })).toBe(6)
  })

  it("入れ子の文字列を全部足す（kind の値は数えない）", () => {
    const short = charsOf({ sections: [{ heading: "", blocks: [table([["a", "b"]])] }] })
    const longer = charsOf({
      sections: [
        {
          heading: "",
          blocks: [
            table([
              ["a", "b"],
              ["ccc", "d"],
            ]),
          ],
        },
      ],
    })
    expect(short).toBe(1 + 2 + 2)
    expect(longer - short).toBe(4)
  })
})
