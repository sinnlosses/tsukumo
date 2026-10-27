// report の呼び出しの例。ツールの説明文の末尾に載せる（SDK の MCP ツール定義には input_examples の欄が無い）。
// 値はすべて架空。

/** 作業の最終レポートの節の例。表（変えた箇所ごとに1行）と、判断ごとに1項目の箇条書き。 */
const SECTIONS_EXAMPLE = {
  sections: [
    {
      heading: "変えたこと",
      shapeTag: "comparison",
      blocks: [
        {
          kind: "table",
          title: "架空の設定の前後",
          columns: ["場所", "前", "後"],
          rows: [["a.ts の上限", "30", "60"]],
        },
      ],
    },
    {
      heading: "そうした理由",
      shapeTag: "single",
      blocks: [
        { kind: "list", style: "bullet", items: [{ text: "30 だと 120 件中 8 件が途中で切れた" }] },
      ],
    },
  ],
}

/** 名前が3つ以上でつながる図の例。矢印に向きと動詞のラベルを付ける。 */
const GRAPH_EXAMPLE = {
  figure: {
    kind: "graph",
    direction: "LR",
    title: "架空の依頼は検査で2つに分かれる",
    source: "受付 -> 検査: 渡す\n検査 -> 保存: 通ったもの\n検査 -> 差し戻し: 落ちたもの",
  },
}

/** 数が3つ以上で大小を見せる図の例。 */
const CHART_EXAMPLE = {
  figure: {
    kind: "chart",
    chartKind: "bar",
    horizontal: true,
    title: "架空の所要は検査が最長",
    labels: ["受付", "検査", "保存"],
    series: [{ name: "秒", values: [3, 12, 5] }],
    emphasis: ["検査"],
  },
}

/** 検証つきの結論の例。結論は読み手から見た変化で、結果の数は checks の figure に分ける。 */
const CONCLUSION_EXAMPLE = {
  conclusion: ["架空の上限を 60 に上げ、遅い依頼も通るようになった。"],
  checks: [
    {
      status: "ok",
      label: "単体テスト",
      figure: "120 件",
      command: "pnpm run test",
      detail: "",
      howToVerify: "",
    },
  ],
}

const REPORT_CALL_EXAMPLES = [
  { name: "表と箇条書きの節（作業の最終レポート）", value: SECTIONS_EXAMPLE },
  { name: "graph の図", value: GRAPH_EXAMPLE },
  { name: "chart の図", value: CHART_EXAMPLE },
  { name: "検証つきの結論", value: CONCLUSION_EXAMPLE },
] as const

/** ツールの説明文の末尾に足す、例の文。 */
export const REPORT_CALL_EXAMPLES_TEXT =
  "呼び出しの例（値は架空。欄の形だけ写す）:\n" +
  REPORT_CALL_EXAMPLES.map((example) => `- ${example.name}: ${JSON.stringify(example.value)}`).join(
    "\n",
  )
