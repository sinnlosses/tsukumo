import { describe, expect, it } from "vitest"

import { reportRejectionText } from "../../../../src/server/report/core/report-rejection.ts"
import { reportViolations } from "../../../../src/server/report/core/report-violation-check.ts"
import type { ReportDraft } from "../../../../src/server/report/core/report-violation.ts"
import type { TableCell } from "../../../../src/shared/report/report-block-comparison.ts"
import type { ReportBlock, ReportSection } from "../../../../src/shared/report/report-block.ts"
import {
  draft,
  kinds,
  markdown,
  mermaid,
  note,
  reportDraftText,
} from "../../../fixture/report-draft-block.ts"

describe("reportViolations", () => {
  it("規約どおりのレポートには違反が無い", () => {
    const blocks: readonly ReportBlock[] = [
      reportDraftText("架空の段落の1文目。2文目。3文目。"),
      {
        kind: "table",
        title: "架空の表（作り物の値）",
        columns: ["列", "値"],
        rows: [["a", { status: "ok", text: "OK" }]],
        rest: "",
        fold: "",
        aside: "",
      },
      mermaid("sequenceDiagram\n  a ->> b: x"),
      note(),
      markdown('<div class="cols"><div class="card">架空の案A</div></div>'),
    ]

    expect(reportViolations(draft(blocks, ["架空の結論の1文目。", "2文目。"]))).toEqual([])
  })

  describe("結論の1文目・見出し・checks の figure", () => {
    const check = (figure: string) => ({
      status: "ok" as const,
      label: "架空の確認",
      figure,
      command: "",
      detail: "",
      howToVerify: "",
    })
    const withHeading = (heading: string): ReportDraft =>
      draft([], "架空の結論。", [
        { heading, shapeTag: "unspecified", blocks: [reportDraftText("架空の本文。")] },
      ])

    it("1要素目が全角50字なら通り、51字なら差し戻す", () => {
      expect(kinds(draft([reportDraftText("架空。")], `${"あ".repeat(50)}。`))).toEqual([])
      expect(kinds(draft([reportDraftText("架空。")], `${"あ".repeat(51)}。`))).toEqual([
        "long-first-sentence",
      ])
    })

    it.each([
      [51, "。"],
      [63, "！"],
    ])("1要素目が%i字の差し戻しは、実測の字数を値と文面に持つ", (length, end) => {
      const violations = reportViolations(
        draft([reportDraftText("架空。")], `${"あ".repeat(length)}${end}`),
      )
      expect(violations).toEqual([{ kind: "long-first-sentence", count: 1, length }])
      expect(reportRejectionText(violations)).toContain(`いま${String(length)}字`)
    })

    it("2要素目が長くても1要素目が短ければ通る", () => {
      expect(kinds(draft([reportDraftText("架空。")], ["短い。", `${"あ".repeat(60)}。`]))).toEqual(
        [],
      )
    })

    it.each([
      ["「」の中の句点", "画面に「保存しました。」と出るようにした。"],
      ["英語のピリオド", "Fixed the parser. Tests pass."],
    ])("%sを含む1要素は割らずに1文と数える", (_, sentence) => {
      expect(kinds(draft([reportDraftText("架空。")], [sentence, "架空の2文目。"]))).toEqual([])
    })

    it("見出しが30字なら通り、31字か疑問文なら差し戻す", () => {
      expect(kinds(withHeading("あ".repeat(30)))).toEqual([])
      expect(kinds(withHeading("あ".repeat(31)))).toEqual(["bad-heading"])
      expect(kinds(withHeading("架空の原因は何か？"))).toEqual(["bad-heading"])
      expect(kinds(withHeading("what?"))).toEqual(["bad-heading"])
    })

    it("figure は分数に見える書き方や日付も差し戻さない", () => {
      const withFigure = (figure: string): ReportDraft => ({
        ...draft([reportDraftText("架空。")]),
        checks: [check(figure)],
      })
      expect(kinds(withFigure("2849 / 56"))).toEqual([])
      expect(kinds(withFigure("2026/10/21"))).toEqual([])
      expect(kinds(withFigure("56 件中 1 件"))).toEqual([])
      expect(kinds(withFigure("ずれ 2px"))).toEqual([])
      expect(kinds(withFigure(""))).toEqual([])
    })

    it("unverified の行の確かめ方が空なら差し戻し、ok・ng の空は通す", () => {
      const withCheck = (status: "ok" | "ng" | "unverified", howToVerify: string): ReportDraft => ({
        ...draft([reportDraftText("架空。")]),
        checks: [{ ...check(""), status, howToVerify }],
      })
      expect(kinds(withCheck("unverified", ""))).toEqual(["unverified-without-how"])
      expect(kinds(withCheck("unverified", "  "))).toEqual(["unverified-without-how"])
      expect(kinds(withCheck("unverified", "架空の窓を開いて札を見る"))).toEqual([])
      expect(kinds(withCheck("ok", ""))).toEqual([])
      expect(kinds(withCheck("ng", ""))).toEqual([])
    })
  })

  describe("矢印と「名前: 説明」", () => {
    const list = (
      items: readonly { label?: string; text: string }[],
      style: "bullet" | "ordered" | "flow" | "cards" = "bullet",
    ): ReportBlock => ({
      kind: "list",
      style,
      items: items.map((item) => ({ label: item.label ?? "", text: item.text, done: false })),
      fold: "",
      aside: "",
    })
    const table = (cell: TableCell): ReportBlock => ({
      kind: "table",
      title: "架空の表",
      columns: ["列", "値"],
      rows: [["a", cell]],
      rest: "",
      fold: "",
      aside: "",
    })

    it("地の文と表のセルの A → B は差し戻す", () => {
      expect(kinds(draft([reportDraftText("架空の旧 → 架空の新に変わる。")]))).toEqual([
        "arrow-in-prose",
      ])
      expect(kinds(draft([table("架空の旧 → 架空の新")]))).toEqual(["arrow-in-prose"])
    })

    it("インラインコードの中・from/to・flow の項目・矢印の無い文は通る", () => {
      expect(kinds(draft([reportDraftText("`a → b` と書く。")]))).toEqual([])
      expect(kinds(draft([table({ from: "架空の旧", to: "架空の新" })]))).toEqual([])
      expect(
        kinds(draft([list([{ text: "架空の段" }, { text: "架空の次の段" }], "flow")])),
      ).toEqual([])
      expect(kinds(draft([reportDraftText("架空の-->と=>は対象外。")]))).toEqual([])
    })

    it("二重のバッククォートのインラインコードを取り違えない", () => {
      expect(kinds(draft([reportDraftText("架空の ``a ` → ` b`` と書く。")]))).toEqual([])
      expect(kinds(draft([reportDraftText("架空の ``a`b`` → `c` に変わる。")]))).toEqual([
        "arrow-in-prose",
      ])
    })

    it("項目の頭の「名前: 説明」は差し戻す", () => {
      expect(kinds(draft([list([{ text: "名前: 架空の説明" }])]))).toEqual(["label-in-item"])
      expect(kinds(draft([list([{ text: "名前：架空の説明" }])]))).toEqual(["label-in-item"])
    })

    it("label がある項目・URL・時刻・インラインコードの頭・長い頭は通る", () => {
      expect(kinds(draft([list([{ label: "名前", text: "架空の説明" }])]))).toEqual([])
      expect(kinds(draft([list([{ text: "https://example.com を開く" }])]))).toEqual([])
      expect(kinds(draft([list([{ text: "12:30 に始まる" }])]))).toEqual([])
      expect(kinds(draft([list([{ text: "`a: b` を渡す" }])]))).toEqual([])
      expect(
        kinds(
          draft([list([{ text: "架空の文が長く続いてからやっと出てくるコロンの説明: 以下" }])]),
        ),
      ).toEqual([])
      expect(kinds(draft([list([{ text: "架空の文。次の文: 以下" }])]))).toEqual([])
    })

    it("3段以上の ordered で全項目に label があれば flow へ差し戻す", () => {
      const stages = [
        { label: "架空の段", text: "架空の説明" },
        { label: "架空の次の段", text: "架空の説明" },
        { label: "架空の最後の段", text: "架空の説明" },
      ]
      expect(kinds(draft([list(stages, "ordered")]))).toEqual(["labeled-ordered"])
      expect(kinds(draft([list(stages, "flow")]))).toEqual([])
      expect(kinds(draft([list(stages.slice(0, 2), "ordered")]))).toEqual([])
      expect(
        kinds(draft([list([...stages.slice(0, 2), { text: "架空の説明" }], "ordered")])),
      ).toEqual([])
    })
  })

  describe("cards の項目数と題", () => {
    const cardItems = (count: number, label = "架空の題") =>
      Array.from({ length: count }, (_, index) => ({
        label,
        text: `架空の本文${String(index + 1)}`,
        done: false,
      }))
    const cards = (items: ReturnType<typeof cardItems>): ReportBlock => ({
      kind: "list",
      style: "cards",
      items,
      fold: "",
      aside: "",
    })

    it("2〜4項目で全項目に題があれば通る", () => {
      expect(kinds(draft([cards(cardItems(2))]))).toEqual([])
      expect(kinds(draft([cards(cardItems(4))]))).toEqual([])
    })

    it("1項目・5項目・題の空の項目は差し戻し、文面は何個目の塊かと項目数を言う", () => {
      expect(kinds(draft([cards(cardItems(1))]))).toEqual(["bad-cards"])
      expect(kinds(draft([cards(cardItems(5))]))).toEqual(["bad-cards"])
      expect(kinds(draft([cards(cardItems(3, ""))]))).toEqual(["bad-cards"])

      const violations = reportViolations(
        draft([reportDraftText("架空の段落。"), cards(cardItems(5))]),
      )
      expect(reportRejectionText(violations)).toContain("2個目の塊は5項目")
    })

    it("cards 以外の1項目・5項目の list は cards の差し戻しにならない", () => {
      const bullets: ReportBlock = {
        kind: "list",
        style: "bullet",
        items: cardItems(1),
        fold: "",
        aside: "",
      }
      expect(kinds(draft([bullets]))).toEqual([])
    })
  })

  describe("日本語でない地の文・見出し", () => {
    it("仮名も漢字も無い英語の文は text の塊なら差し戻し、見出しは差し戻さない", () => {
      expect(kinds(draft([reportDraftText("Fixed the bug in the parser.")]))).toEqual([
        "non-japanese",
      ])
      expect(
        kinds(
          draft([], "架空の結論。", [
            {
              heading: "Claude Agent SDK",
              shapeTag: "unspecified",
              blocks: [reportDraftText("架空。")],
            },
          ]),
        ),
      ).toEqual([])
    })

    it("日本語を含む文・コードやパスだけの文・語の少ない見出しは通る", () => {
      expect(kinds(draft([reportDraftText("`parser.ts` の bug を直した。")]))).toEqual([])
      expect(
        kinds(draft([reportDraftText("`Fixed the bug in the parser` と `src/a.ts`")])),
      ).toEqual([])
      expect(kinds(draft([reportDraftText("src/server/a.ts and src/server/b.ts")]))).toEqual([])
      expect(
        kinds(draft([reportDraftText("[Fixed the bug in the parser](https://example.com/a)")])),
      ).toEqual([])
      expect(
        kinds(
          draft([], "架空の結論。", [
            { heading: "Parser", shapeTag: "unspecified", blocks: [reportDraftText("架空。")] },
          ]),
        ),
      ).toEqual([])
      expect(kinds(draft([reportDraftText("OK")]))).toEqual([])
    })

    it("二重のバッククォートの中の英語は数えない", () => {
      expect(kinds(draft([reportDraftText("``use the ` thing here`` ok")]))).toEqual([])
    })
  })

  describe("conclusion は2要素まで", () => {
    it("3要素あれば違反", () => {
      expect(reportViolations(draft([], ["架空の1文目。", "2文目。", "3文目。"]))).toEqual([
        { kind: "long-conclusion", count: 3 },
      ])
    })

    it("1要素の中の句点では文を数えない", () => {
      expect(kinds(draft([], ["架空の1文目。2文目。3文目。"]))).toEqual([])
    })
  })

  describe("地の文の長さ", () => {
    it("4文以上の text の塊・markdown の段落は違反にしない", () => {
      expect(kinds(draft([reportDraftText("架空の1文目。2文目。3文目。4文目。")]))).toEqual([])
      expect(kinds(draft([markdown("架空の1文目。2文目。3文目。4文目。")]))).toEqual([])
    })
  })

  describe("節が2つ以上なら全部に見出し", () => {
    it("見出しの無い節があれば違反", () => {
      const sections: readonly ReportSection[] = [
        { heading: "架空の節", shapeTag: "unspecified", blocks: [reportDraftText("架空の一。")] },
        { heading: " ", shapeTag: "unspecified", blocks: [reportDraftText("架空の二。")] },
      ]
      expect(reportViolations(draft([], "架空の結論。", sections))).toEqual([
        { kind: "untitled-section", count: 1 },
      ])
    })

    it("節が1つなら見出しが無くてもよい", () => {
      expect(kinds(draft([reportDraftText("架空の一。")]))).toEqual([])
    })
  })

  describe("画面のファイルを変えたのに画像が無い", () => {
    const files = (path: string, change: "added" | "modified" | "read"): ReportBlock => ({
      kind: "files",
      items: [{ path, change, note: "" }],
      title: "",
      fold: "",
      aside: "",
    })
    const image: ReportBlock = {
      kind: "image",
      path: "架空.png",
      caption: "架空の画面。",
      notes: [],
      fold: "",
      aside: "",
    }
    const unverified = {
      status: "unverified" as const,
      label: "架空の確認",
      figure: "",
      command: "",
      detail: "架空の理由",
      howToVerify: "架空の確かめ方。",
    }

    it("src/browser/ の .tsx を追加・変更して画像が無ければ差し戻す", () => {
      expect(kinds(draft([files("src/browser/架空.tsx", "modified")]))).toEqual([
        "browser-change-without-image",
      ])
      expect(kinds(draft([files("src/browser/架空.css", "added")]))).toEqual([
        "browser-change-without-image",
      ])
    })

    it("checks に unverified の行があれば差し戻さない", () => {
      const report = { ...draft([files("src/browser/架空.tsx", "modified")]), checks: [unverified] }
      expect(kinds(report)).toEqual([])
    })

    it("src/server/ のファイルだけ、.md だけ、読んだだけ（read）では差し戻さない", () => {
      expect(kinds(draft([files("src/server/架空.ts", "modified")]))).toEqual([])
      expect(kinds(draft([files("src/browser/架空.md", "modified")]))).toEqual([])
      expect(kinds(draft([files("src/browser/架空.ts", "modified")]))).toEqual([])
      expect(kinds(draft([files("src/browser/架空.tsx", "read")]))).toEqual([])
    })

    it("image の塊か beforeAfter の image の側があれば差し戻さない", () => {
      const beforeAfter: ReportBlock = {
        kind: "beforeAfter",
        title: "架空",
        before: { kind: "image", path: "架空.png" },
        after: { kind: "points", points: ["架空"] },
        fold: "",
        aside: "",
      }
      expect(kinds(draft([files("src/browser/架空.tsx", "modified"), image]))).toEqual([])
      expect(kinds(draft([files("src/browser/架空.tsx", "modified"), beforeAfter]))).toEqual([])
    })
  })
})
