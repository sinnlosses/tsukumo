import { describe, expect, it } from "vitest"

import { plainWordSpellingsIn as spellingsOf } from "../../../../src/server/report/core/plain-word-find.ts"
import { reportRejectionText } from "../../../../src/server/report/core/report-rejection.ts"
import { reportViolations } from "../../../../src/server/report/core/report-violation-check.ts"
import type { ReportDraft } from "../../../../src/server/report/core/report-violation.ts"
import type { ReportBlock } from "../../../../src/shared/report/report-block.ts"
import { reportOutline } from "../../../../src/shared/report/report-outline.ts"
import { draft, markdown, reportDraftText } from "../../../fixture/report-draft-block.ts"
import { reportDraft } from "../../../fixture/report-event.ts"

const plainWordSpellingsIn = (report: ReportDraft) =>
  spellingsOf(report, reportOutline(report.components))

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

  it("帯・傍注・面・葉の複合語は地の文で見つかる", () => {
    expect(
      plainWordSpellingsIn(
        draft([reportDraftText("架空の進み具合の帯と傍注を、詳細の面の葉の部品で描く。")]),
      ),
    ).toEqual(["進み具合の帯", "傍注", "詳細の面", "葉の部品"])
  })

  it("画面の名前・言葉の選び方・場面・設定の画面・携帯の帯域は、登録した複合語に当たらない", () => {
    expect(
      plainWordSpellingsIn(
        draft([reportDraftText("架空の画面の名前と言葉の選び方と場面と設定の画面と携帯の帯域。")]),
      ),
    ).toEqual([])
  })

  it("既知の巻き込み: 言葉の部品と詳細の面倒は、部分一致で当たる", () => {
    expect(
      plainWordSpellingsIn(draft([reportDraftText("架空の言葉の部品と詳細の面倒。")])),
    ).toEqual(["詳細の面", "葉の部品"])
  })

  it("棚卸し・再現の台本は、棚・台本の複合語に当たらない", () => {
    expect(
      plainWordSpellingsIn(draft([reportDraftText("架空の棚卸しをして、再現の台本を読む。")])),
    ).toEqual([])
  })

  it("既知の巻き込み: 本棚から・本棚に置くは、部分一致で当たる", () => {
    expect(
      plainWordSpellingsIn(draft([reportDraftText("架空の本を本棚から出し、本棚に置く。")])),
    ).toEqual(["棚に置", "棚から"])
  })

  it("ワークプランのフェーズの旧称の複合語は、表の順に地の文で見つかる", () => {
    expect(
      plainWordSpellingsIn(
        draft([
          reportDraftText(
            "架空のまとめ待ちの段と並列の段と委譲先の段と段ごとの時間と段の群と段の閉じ方。",
          ),
        ]),
      ),
    ).toEqual(["まとめ待ちの段", "並列の段", "委譲先の段", "段ごとの時間", "段の群", "段の閉じ方"])
  })

  it("段落・後段・段差・手段・段階は、段の複合語に当たらない", () => {
    expect(
      plainWordSpellingsIn(
        draft([
          reportDraftText(
            "架空の1段落と後段と段差と手段の数と最後の段落と今の段階と飛ばした段落。",
          ),
        ]),
      ),
    ).toEqual([])
  })

  it("既知の巻き込み: 並列の段階は、部分一致で当たる", () => {
    expect(plainWordSpellingsIn(draft([reportDraftText("架空の並列の段階。")]))).toEqual([
      "並列の段",
    ])
  })

  it("段の複合語の差し戻しは、言い換え先を示す", () => {
    const text = reportRejectionText(
      reportViolations(draft([reportDraftText("架空の並列の段の話。")])),
    )
    expect(text).toContain("「並列の段」は「並列のフェーズ」")
  })

  it("帯・傍注・面・葉の複合語もコードと引用の中は見ない", () => {
    expect(
      plainWordSpellingsIn(
        draft([
          reportDraftText("架空の `進み具合の帯` と `傍注` と `葉の部品`。"),
          reportDraftText("> 詳細の面の図の葉"),
        ]),
      ),
    ).toEqual([])
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

  it("Quote の文と出典の中は見ない", () => {
    const quote: ReportBlock = {
      kind: "quote",
      text: "架空の再演の一文。",
      source: "架空の有界な自律の出典",
      fold: "",
      aside: "",
    }
    expect(plainWordSpellingsIn(draft([quote]))).toEqual([])
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

  it("節点は見つけ、お札や塊（かたまり）のような頻出の語は表に無いので通る", () => {
    expect(plainWordSpellingsIn(draft([reportDraftText("架空の節点が3つある。")]))).toEqual([
      "節点",
    ])
    expect(plainWordSpellingsIn(draft([reportDraftText("お札と氷の塊を並べる。")]))).toEqual([])
  })

  it("札の複合語は、表の順に地の文で見つかる", () => {
    expect(
      plainWordSpellingsIn(
        draft([
          reportDraftText(
            "架空の吊り札を開き、変更の札と形の札を見て、答え待ちの札とプラン使用量の札を押す。",
          ),
        ]),
      ),
    ).toEqual(["プラン使用量の札", "答え待ちの札", "吊り札", "形の札", "変更の札"])
  })

  it("お札・名札・改札・入札・表札・札幌・親の札は、札の複合語に当たらない", () => {
    expect(
      plainWordSpellingsIn(
        draft([reportDraftText("架空のお札と名札と改札と入札と表札と札幌と親の札。")]),
      ),
    ).toEqual([])
  })

  it("既知の巻き込み: 複数の札束は、部分一致で数の札に当たる", () => {
    expect(plainWordSpellingsIn(draft([reportDraftText("架空の複数の札束。")]))).toEqual(["数の札"])
  })

  it("部品を指す塊の複合語は見つかり、氷の塊・岩の塊の数のような普通の語は通る", () => {
    expect(
      plainWordSpellingsIn(
        draft([reportDraftText("架空の失敗の塊とファイルの塊を見て、何個目の塊かを数える。")]),
      ),
    ).toEqual(["失敗の塊", "ファイルの塊", "何個目の塊"])
    expect(
      plainWordSpellingsIn(
        draft([
          reportDraftText("架空の氷の塊の数と岩の塊の間と塊ごとの重さと氷の塊の種類と氷の塊の欄。"),
        ]),
      ),
    ).toEqual([])
  })

  it("既知の巻き込み: 意図の塊は、部分一致で図の塊に当たる", () => {
    expect(plainWordSpellingsIn(draft([reportDraftText("架空の意図の塊。")]))).toEqual(["図の塊"])
  })

  it("塊の複合語の差し戻しは、言い換え先を示す", () => {
    const text = reportRejectionText(
      reportViolations(draft([reportDraftText("架空の失敗の塊の話。")])),
    )
    expect(text).toContain("「失敗の塊」は「失敗の表示」")
  })

  it("札の複合語の差し戻しは、言い換え先を示す", () => {
    const text = reportRejectionText(
      reportViolations(draft([reportDraftText("架空の答え待ちの札の話。")])),
    )
    expect(text).toContain("「答え待ちの札」は「答え待ちのカード」")
  })

  it("レポートの区切りを指す節の複合語は見つかり、文書の節・節点・節目・季節・小節は通る", () => {
    expect(
      plainWordSpellingsIn(
        draft([
          reportDraftText(
            "架空のレポートの節に、見出しの無い節がある。節の塊を置く。節が2つ以上ある。",
          ),
        ]),
      ),
    ).toEqual(["レポートの節", "見出しの無い節", "節の塊", "節が2つ以上"])
    expect(
      plainWordSpellingsIn(
        draft([reportDraftText("規約の節に従う。この節は節目の季節に書いた小節を指す。")]),
      ),
    ).toEqual([])
  })

  it("枠（Card）の先頭の見出しの語も見つける", () => {
    const panel = {
      kind: "panel",
      title: "架空の再演の枠",
      blocks: [{ kind: "text", text: "架空の段落。", fold: "", aside: "" }],
      fold: "",
      aside: "",
    }
    expect(
      plainWordSpellingsIn(draft([], "架空の結論。", [{ heading: "", blocks: [panel] }])),
    ).toEqual(["再演"])
  })

  it("図・振り返りの塊の語は本文でないので見ない", () => {
    expect(
      plainWordSpellingsIn(
        reportDraft({
          sections: [
            {
              heading: "",
              blocks: [reportDraftText("架空の段落。")],
            },
          ],
          retrospective: {
            kind: "recorded",
            summary: "架空の再演の要約",
            drafts: [],
            blocks: [reportDraftText("架空の再演の塊")],
          },
        }),
      ),
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
