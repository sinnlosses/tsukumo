// 撮影の出力（架空の文字列）から、穴ドラフトの本文の下書きを組む関数の振る舞いを見る。

import { describe, expect, test } from "vitest"

import {
  formatDraft,
  readOverflow,
  readPaperMetricBlock,
  readTextLength,
  type ComparisonDraftInput,
} from "../../../../scripts/capture/lib/comparison-draft.ts"

describe("撮影の出力を読む", () => {
  test("横のはみ出しと字数の数を取る", () => {
    const stdout = "撮った: /tmp/a.png（390x900）\n字数 body: 128\n横のはみ出し: 12px\n"

    expect(readOverflow(stdout)).toBe(12)
    expect(readTextLength(stdout)).toBe(128)
  })

  test("無い・読めない行は undefined", () => {
    expect(readTextLength("字数 body: 無し\n")).toBeUndefined()
    expect(readOverflow("横のはみ出し: abcpx\n")).toBeUndefined()
    expect(readOverflow("")).toBeUndefined()
  })

  test("紙面の物差しは見出しから終わりまでを表のまま取る", () => {
    const stdout = "横のはみ出し: 0px\n紙面の物差し 390x900\n| 項目 | 値 |\n| --- | --- |\n"

    expect(readPaperMetricBlock(stdout)).toBe("紙面の物差し 390x900\n| 項目 | 値 |\n| --- | --- |")
    expect(readPaperMetricBlock("横のはみ出し: 0px\n")).toBeUndefined()
  })
})

describe("穴ドラフトの本文の下書き", () => {
  const input: ComparisonDraftInput = {
    topic: "架空の流れ図",
    date: "2026-01-02",
    htmlPath: "/tmp/fictional/page.html",
    scene: "report-blocks",
    session: undefined,
    widths: [
      {
        width: 390,
        report: { kind: "captured", image: "/tmp/out/report-390.png", overflow: 0, length: 900 },
        html: { kind: "captured", image: "/tmp/out/html-390.png", overflow: 14, length: 700 },
        paperMetric: "紙面の物差し 390x900\n| 項目 | 値 |",
      },
      {
        width: 1400,
        report: { kind: "failed", reason: "現れなかった" },
        html: {
          kind: "captured",
          image: "/tmp/out/html-1400.png",
          overflow: undefined,
          length: 710,
        },
        paperMetric: undefined,
      },
    ],
  }

  test("型の見出しと箇条が順に並び、人が書く欄は空欄で出る", () => {
    const draft = formatDraft(input)
    const order = [
      "見比べで見つかった穴（梯子の段:",
      "- 比べた題材と日付: 架空の流れ図（2026-01-02）",
      "- Claude 側の部品:",
      "- tsukumo で試した書き方: 場面 report-blocks",
      "- 起きたこと:",
      "- 候補と採らない理由: （人が書く）",
      "- 足す基準の数: （人が書く）",
    ].map((part) => draft.indexOf(part))

    expect(order.every((position) => position >= 0)).toBe(true)
    expect(order).toEqual(order.toSorted((a, b) => a - b))
  })

  test("幅ごとに画像のパス・はみ出し px・字数が出る", () => {
    const draft = formatDraft(input)

    expect(draft).toContain("画像 /tmp/out/report-390.png / 横のはみ出し 0px / 字数 900")
    expect(draft).toContain("画像 /tmp/out/html-390.png / 横のはみ出し 14px / 字数 700")
    expect(draft).toContain("紙面の物差し 390x900")
  })

  test("撮れなかった版は理由つきで出て、ほかの幅は残る", () => {
    const draft = formatDraft(input)

    expect(draft).toContain("撮れなかった（現れなかった）")
    expect(draft).toContain("画像 /tmp/out/html-1400.png / 横のはみ出し 読めず / 字数 710")
  })

  test("疑似セッションを渡すと書き方の箇条に出る", () => {
    expect(formatDraft({ ...input, session: "/tmp/fictional/session.json" })).toContain(
      "場面 report-blocks（疑似セッション /tmp/fictional/session.json）",
    )
  })
})
