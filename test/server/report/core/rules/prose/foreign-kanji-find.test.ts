import { describe, expect, it } from "vitest"

import type { ReportDraft } from "../../../../../../src/server/report/core/rules/draft.ts"
import {
  foreignKanjiIn as foreignKanjiOf,
  foreignKanjiInSpeech,
} from "../../../../../../src/server/report/core/rules/prose/foreign-kanji-find.ts"
import {
  reportRejectionText,
  reportViolations,
} from "../../../../../../src/server/report/core/rules/report-violation.ts"
import { createCallReview } from "../../../../../../src/server/session-driver/core/call-review.ts"
import { reportOutline } from "../../../../../../src/shared/report/report-outline.ts"
import { draft, reportDraftText } from "../../../../../fixture/report-draft-block.ts"
import { reportDraft } from "../../../../../fixture/report-event.ts"

const foreignKanjiIn = (report: ReportDraft) =>
  foreignKanjiOf(report, reportOutline(report.components))

describe("日本語でない漢字", () => {
  it("地の文の簡体字を初出の順に、重ならせず返す", () => {
    expect(foreignKanjiIn(draft([reportDraftText("架空の们と见と们。")]))).toEqual(["们", "见"])
  })

  it("日本語の漢字と許す表の4字は拾わない", () => {
    expect(
      foreignKanjiIn(draft([reportDraftText("見帳々〆髙﨑と叱の𠮟塡剝頰。")], "架空の結論。")),
    ).toEqual([])
  })

  it("バッククォートのコードと引用の中は見ない", () => {
    expect(foreignKanjiIn(draft([reportDraftText("架空の `见` と\n\n> 引用の见\n\n")]))).toEqual([])
  })

  it("セリフの簡体字も拾い、コードの中は見ない", () => {
    expect(foreignKanjiInSpeech("架空の见本と見本")).toEqual(["见"])
    expect(foreignKanjiInSpeech("架空の `见` だけ")).toEqual([])
  })
})

const foreignKanjiViolations = (report: ReportDraft) =>
  reportViolations(report).filter((violation) => violation.kind === "foreign-kanji")

describe("日本語でない漢字のレポートの差し戻し", () => {
  const reports = {
    結論: draft([reportDraftText("架空の段落。")], "架空の独自の文面见。"),
    表のセル: draft([
      {
        kind: "table",
        title: "架空の表",
        columns: ["甲", "乙"],
        rows: [["架空の独自の文面见", "2"]],
        rest: "",
        fold: "",
        aside: "",
      },
    ]),
    項目: draft([
      {
        kind: "list",
        style: "bullet",
        items: [
          {
            label: "",
            text: "架空の独自の文面见",
            done: false,
            source: "",
            branch: "",
            branchTone: "warn",
          },
        ],
        fold: "",
        aside: "",
      },
    ]),
  } as const

  it.each(Object.entries(reports))("%sの见を、当たった字だけで拒む", (_name, report) => {
    expect(foreignKanjiViolations(report)).toEqual([
      { kind: "foreign-kanji", count: 1, chars: ["见"] },
    ])
    const text = reportRejectionText(reportViolations(report))
    expect(text).toContain("「见」")
    expect(text).not.toContain("架空の独自の文面")
  })

  it("締めのセリフの簡体字も拒む", () => {
    expect(foreignKanjiViolations({ ...reportDraft({}), speechTexts: ["架空の见本"] })).toEqual([
      { kind: "foreign-kanji", count: 1, chars: ["见"] },
    ])
  })
})

describe("日本語でない漢字の speak", () => {
  it("画面に出す前に拒み、セリフの文面は写さない", () => {
    const verdict = createCallReview().judgeSpeechWording("架空の独自の文面见")

    expect(verdict).toEqual({ kind: "rejected", text: expect.stringContaining("「见」") })
    expect(verdict.kind === "rejected" ? verdict.text : "").not.toContain("独自の文面")
  })

  it("コードの中だけの见は通す", () => {
    expect(createCallReview().judgeSpeechWording("架空の `见` だけ")).toEqual({
      kind: "accepted",
    })
  })
})
