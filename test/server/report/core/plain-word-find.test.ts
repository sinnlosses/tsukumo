import { describe, expect, it } from "vitest"

import { plainWordSpellingsIn } from "../../../../src/server/report/core/plain-word-find.ts"
import { reportRejectionText } from "../../../../src/server/report/core/report-rejection.ts"
import { reportViolations } from "../../../../src/server/report/core/report-violation-check.ts"
import type { ReportBlock } from "../../../../src/shared/report/report-block.ts"
import { draft, markdown, reportDraftText } from "../../../fixture/report-draft-block.ts"

describe("plainWordSpellingsIn", () => {
  it("地の文の表の語を、表の順に返す", () => {
    expect(
      plainWordSpellingsIn(draft([reportDraftText("架空の有界な自律と再演を使う。")])),
    ).toEqual(["再演", "有界な自律"])
  })

  it("結論の中の語も見つける", () => {
    expect(
      plainWordSpellingsIn(draft([reportDraftText("架空の段落。")], "架空の再演の結論。")),
    ).toEqual(["再演"])
  })

  it("長い綴りに当たった箇所は短い綴りに数えない", () => {
    expect(plainWordSpellingsIn(draft([reportDraftText("架空の再演集を開く。")]))).toEqual([
      "再演集",
    ])
  })

  it("活用や派生語は綴りに当たる", () => {
    expect(plainWordSpellingsIn(draft([reportDraftText("架空の再演する流れ。")]))).toEqual(["再演"])
  })

  it("インラインコード・コード・引用の中は見ない", () => {
    expect(
      plainWordSpellingsIn(
        draft([
          reportDraftText("架空の `再演` の話。"),
          reportDraftText("```\n再演\n```"),
          reportDraftText("> 再演"),
        ]),
      ),
    ).toEqual([])
  })

  it("note・markdown・節の見出しの中の語も見つける", () => {
    const note: ReportBlock = {
      kind: "note",
      tone: "info",
      text: "架空の再演の一文。",
      fold: "",
      aside: "",
    }
    expect(plainWordSpellingsIn(draft([note]))).toEqual(["再演"])
    expect(plainWordSpellingsIn(draft([markdown("架空の有界な自律の段落。")]))).toEqual([
      "有界な自律",
    ])
    expect(
      plainWordSpellingsIn(
        draft([], "架空の結論。", [
          {
            heading: "架空の再演の見出し",
            shapeTag: "unspecified",
            blocks: [reportDraftText("架空の段落。")],
          },
        ]),
      ),
    ).toEqual(["再演"])
  })

  it("flow の branch の語も見つけ、出どころ（source）は地の文でないので見ない", () => {
    const flow = (source: string, branch: string): ReportBlock => ({
      kind: "list",
      style: "flow",
      items: [{ label: "", text: "架空の段", done: false, source, branch, branchTone: "ng" }],
      fold: "",
      aside: "",
    })

    expect(plainWordSpellingsIn(draft([flow("", "架空の再演へ戻す")]))).toEqual(["再演"])
    expect(plainWordSpellingsIn(draft([flow("再演", "")]))).toEqual([])
  })

  it("節点は見つけ、始め方の札や塊（かたまり）のような頻出の語は表に無いので通る", () => {
    expect(plainWordSpellingsIn(draft([reportDraftText("架空の節点が3つある。")]))).toEqual([
      "節点",
    ])
    expect(
      plainWordSpellingsIn(draft([reportDraftText("始め方の札を押す。お札と氷の塊を並べる。")])),
    ).toEqual([])
  })

  it("表に無い語は通る", () => {
    expect(plainWordSpellingsIn(draft([reportDraftText("架空の普通の文。")]))).toEqual([])
  })
})

describe("plain-word の違反", () => {
  const violations = reportViolations(draft([reportDraftText("架空の再演と有界な自律の話。")]))

  it("違反に載り、差し戻しの文面に言い換え先が出る", () => {
    expect(violations).toEqual([
      { kind: "plain-word", count: 2, spellings: ["再演", "有界な自律"] },
    ])
    const text = reportRejectionText(violations)
    expect(text).toContain("「再演」は「タスクの再試」")
    expect(text).toContain("「有界な自律」は「承認なし実行の上限」")
  })

  it("書かれた文面は差し戻しに写さない", () => {
    expect(reportRejectionText(violations)).not.toContain("架空の")
  })
})
