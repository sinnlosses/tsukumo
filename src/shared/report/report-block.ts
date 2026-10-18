// `report` の本文の節と塊の形と、その検証。
// 形の出どころはここだけ。

import { z } from "zod"

import { readGraphSource } from "./graph-source.ts"
import { MAX_CANDIDATES, MAX_HEADING, MAX_ITEM_LABEL } from "./report-limit.ts"

const inlineText = z.string()

// 畳むときの見出し。説明は `REPORT_SECTIONS_DESCRIPTION` に1回だけ書く
// （ここに `.describe` を足すと塊の数だけ繰り返されて JSON Schema が膨らむ）。
const fold = z.string().default("")

// 塊の傍注（余白の柱に置く1行）。説明は `fold` と同じく `REPORT_SECTIONS_DESCRIPTION` に1回だけ書く。
const aside = z.string().default("")

const textBlockSchema = z.object({
  kind: z.literal("text"),
  text: inlineText.describe(
    "地の文。3文まで（4文目が要るなら表・箇条書きへ移すか fold で畳む）。結論に効く数が3つ以上並び前後か推移を見せるなら stats",
  ),
  fold,
  aside,
})

const listBlockSchema = z.object({
  kind: z.literal("list"),
  style: z
    .enum(["bullet", "ordered", "check", "flow"])
    .describe(
      "bullet は発見の一覧（候補の採否は options、ファイルは files。項目ごとに言うことが2つ以上なら表）/ ordered は順番に意味がある手順 / check は済み（done）と未了が混じる並び / " +
        "flow は段ごとに文が要る一本道（A → B → C と書かず項目を段にする。段の名前が短い一本道・分岐・合流・戻りがあるなら graph）",
    ),
  items: z
    .array(
      z.object({
        label: inlineText
          .default("")
          .describe(
            `名前と説明の対の名前（「名前: 説明」と text に書かず、名前をここに分ける。${String(MAX_ITEM_LABEL)}字以内）`,
          ),
        text: inlineText,
        done: z.boolean().default(false),
      }),
    )
    .min(1)
    .describe("10件まで。超えるなら上位を残し、最後の項目を「ほか n 件」にする"),
  fold,
  aside,
})

export const REPORT_CELL_STATUSES = ["ok", "warn", "ng"] as const

const cellSchema = z.union([
  inlineText,
  z
    .object({ status: z.enum(REPORT_CELL_STATUSES), text: inlineText })
    .describe("状態のセル。記号付きの印で描くので、状態を言う文字も text に書く"),
  z
    .object({ from: inlineText, to: inlineText })
    .describe("変わったセル（A → B と書かず前と後に分ける。状態は隣の列に置く）"),
])

const tableBlockSchema = z
  .object({
    kind: z.literal("table"),
    title: inlineText.describe(
      "セルに無いことだけ: 何を並べた表か・並べた基準・数の出どころ。数と向きで主張を言う1文。評価語なし",
    ),
    columns: z.array(inlineText).min(2).describe("列は5つまで"),
    rows: z
      .array(z.array(cellSchema))
      .min(1)
      .describe("行ごとのセル。数は columns と揃える。セルは1行、空にせず「なし」と書く"),
    rest: inlineText
      .default("")
      .describe(
        "切った残りを1行で（「ほか 12 件（0.5% 未満）」）。行が10を超えるなら上位10行までを rows に置き、残りをここに書く",
      ),
    fold,
    aside,
  })
  .describe(
    "比較・対応・件数。同じ形の項目が2つ以上並んだら表（候補の採否は options、交点が状態だけなら matrix）。行は大きさか重要度の順（1列目のあいうえお順にしない）。単位は見出しに1回だけ書きセルに書かない。2行以下なら表にせず label 付きの list か文に",
  )

export const REPORT_MATRIX_STATUSES = ["ok", "warn", "ng", "na"] as const

const matrixBlockSchema = z
  .object({
    kind: z.literal("matrix"),
    title: inlineText.describe("何と何を掛けた対応か・状態の基準"),
    columns: z.array(inlineText).min(1),
    rows: z
      .array(
        z.object({
          name: inlineText,
          cells: z
            .array(z.enum(REPORT_MATRIX_STATUSES))
            .describe("列ごとの状態。na は該当なし。数は columns と揃える"),
        }),
      )
      .min(1),
    fold,
    aside,
  })
  .describe("行×列の交点が状態だけの対応表（機能×条件）。交点に文や数が要るなら table")

const compareBlockSchema = z
  .object({
    kind: z.literal("compare"),
    title: inlineText,
    sides: z
      .array(
        z.object({
          heading: inlineText,
          points: z
            .array(inlineText)
            .min(1)
            .describe(`${String(MAX_CANDIDATES)}つまで`),
        }),
      )
      .min(2)
      .max(2),
    fold,
    aside,
  })
  .describe(
    "2つを同時に見比べる（案A と案B。変更の前と後は beforeAfter）。側ごとに見出しと短い箇条。採否は options、値を揃えるなら table（3つ以上も table）",
  )

const graphFields = {
  direction: z.enum(["TD", "LR"]).describe("TD は上から下 / LR は左から右"),
  source: z
    .string()
    .refine((value) => readGraphSource(value).nodes.length > 0, "source に節点が1つも無い")
    .describe(
      "1行1辺。`A -> B: 語`（`: 語` は辺のラベル。省ける）。`(始点)` は始点・終点、`{分岐?}` は分岐、包みが無ければ処理。同じ名前は同じ節点（包みは最初の1回だけでよい）。`->` の無い行は節点だけの宣言。変更の前後は行頭に `+ `（足した）・`- `（消した）・`~ `（変えた）を付ける（辺の行は辺に、節点だけの行は節点に掛かる。同じ節点に違う印は付けない）。囲みは `[群の名]` だけの行で始め `[]` だけの行で閉じる（間の行の節点がその群。1階層で入れ子は不可）",
    ),
}

const svgShapeSchema = z
  .discriminatedUnion("kind", [
    z.object({
      kind: z.literal("rect"),
      x: z.number(),
      y: z.number(),
      width: z.number().positive(),
      height: z.number().positive(),
      label: inlineText.default("").describe("枠の中に出す名前。無ければ空"),
      emphasis: z.boolean().default(false).describe("true で枠を強調する"),
    }),
    z.object({
      kind: z.literal("line"),
      x1: z.number(),
      y1: z.number(),
      x2: z.number(),
      y2: z.number(),
      arrow: z.boolean().default(false).describe("true で終点（x2, y2）に矢じりを付ける"),
      label: inlineText.default("").describe("線に添える語。無ければ空"),
    }),
    z.object({ kind: z.literal("text"), x: z.number(), y: z.number(), text: inlineText }),
  ])
  .meta({ id: "SvgShape" })

const svgFields = {
  width: z.number().positive().describe("viewBox の幅。図形はこの内側に収める"),
  height: z.number().positive().describe("viewBox の高さ。図形はこの内側に収める"),
  shapes: z
    .array(svgShapeSchema)
    .min(1)
    .describe("座標つきの図形の並び。色は書けない（rect の emphasis だけで強調する）"),
}

const beforeAfterSideSchema = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("svg"), ...svgFields }),
    z.object({
      kind: z.literal("mermaid"),
      source: z.string().describe("flowchart 以外の図のソース"),
    }),
    z.object({
      kind: z.literal("image"),
      path: z.string().describe("撮った画像のファイル（絶対か cwd から。png・jpeg・gif・webp）"),
    }),
    z.object({
      kind: z.literal("code"),
      language: z.string().describe("言語名（diff にせず、その側の中身をそのまま書く）"),
      source: z.string(),
    }),
    z.object({
      kind: z.literal("points"),
      points: z
        .array(inlineText)
        .min(1)
        .describe(`短い1行の並び。${String(MAX_CANDIDATES)}つまで`),
    }),
  ])
  .meta({ id: "BeforeAfterSide" })

const beforeAfterBlockSchema = z
  .object({
    kind: z.literal("beforeAfter"),
    title: inlineText.describe("何の前後か"),
    before: beforeAfterSideSchema,
    after: beforeAfterSideSchema,
    fold,
    aside,
  })
  .describe(
    "変更の前と後を左に前・右に後で並べ、間に矢印を置く（画面の撮影・構造の前後）。1行の設定や文言の変更には使わない（1つの値の前後は table のセルの from / to）。ファイル名の箇条書きで変更を説明しない。側ごとに image / code / points / mermaid / svg のどれか（左右で違ってよい）。構造の前後は graph の `+` / `-` / `~` の印、時間の順の前後は mermaid の側。" +
      "向きの無い2つは compare、数の前後は stats の before、行ごとの差分は code の diff、寸法の前後は dimension の before",
  )

const dimensionBefore = z.string().default("").describe("変わる前の値（前後を見せるときだけ）")

const dimensionBlockSchema = z
  .object({
    kind: z.literal("dimension"),
    title: inlineText,
    parts: z
      .array(
        z.union([
          z.object({
            name: inlineText,
            size: z.string().default("").describe("領域の寸法（字 21px・高さ 56px）。無ければ空"),
            before: dimensionBefore,
          }),
          z.object({ gap: z.string().describe("前後の領域の間の余白"), before: dimensionBefore }),
        ]),
      )
      .min(2)
      .describe("上から順の並び。先頭・末尾の gap は外側の余白"),
    fold,
    aside,
  })
  .describe(
    "上から積む領域と、その間の余白・字の大きさの寸法（余白を直した前後）。横並び・重なりは svg",
  )

const REPORT_NOTE_TONES = ["info", "warn", "ng", "ask", "memo"] as const

const noteBlockSchema = z.object({
  kind: z.literal("note"),
  tone: z
    .enum(REPORT_NOTE_TONES)
    .describe("info は結論 / warn は注意 / ng は異常 / ask は確かめていないこと / memo は覚え書き"),
  text: inlineText.describe(
    "読み飛ばされると困る一文。種別を言う語（「注意:」など）は書かない。1つのレポートに2個まで・隣接させない・見出しの直後に置かない（戻せない操作の warn / ng は隣接と見出しの直後が例外）",
  ),
  fold,
  aside,
})

const statsBlockSchema = z
  .object({
    kind: z.literal("stats"),
    items: z
      .array(
        z.object({
          before: z.string().default("").describe("変わる前の数（前後を見せるときだけ）"),
          value: z.string(),
          total: z
            .string()
            .default("")
            .describe("全体の数（割合を帯で添える。value が全体のうちの数のとき）"),
          label: inlineText,
          series: z
            .array(z.number())
            .default([])
            .describe("推移の数の並び（3つ以上。省いてよい）。value の左に折れ線で添える"),
          better: z
            .enum(["up", "down", ""])
            .default("")
            .describe("before と value が数のとき、増えて良いなら up・減って良いなら down"),
        }),
      )
      .min(3)
      .max(4),
    fold,
    aside,
  })
  .describe(
    "結論に効く数（件数・前後の差）。数が3〜4個並び、前後か推移を見せるとき。2つ以下の数は結論か本文の文に入れる。推移の形が要る数には series、増減の良い向きが要る数には better",
  )

const REPORT_OPTION_VERDICTS = ["adopt", "consider", "reject"] as const

const optionsBlockSchema = z
  .object({
    kind: z.literal("options"),
    title: inlineText.describe("何を決める比較か"),
    items: z
      .array(
        z.object({
          name: inlineText,
          verdict: z.enum(REPORT_OPTION_VERDICTS),
          reason: inlineText.describe("判定の理由。1文"),
        }),
      )
      .min(2)
      .describe(`候補は${String(MAX_CANDIDATES)}つまで`),
    fold,
    aside,
  })
  .describe(
    "候補を比べて採る・検討・採らないを言うとき。採る → 検討 → 採らないの順に書く（崩れると差し戻す）。書いた順に1始まりの番号を振って描く",
  )

const imageBlockSchema = z
  .object({
    kind: z.literal("image"),
    path: z.string().describe("撮った画像のファイル（絶対か cwd から。png・jpeg・gif・webp）"),
    caption: inlineText.describe("何が見えるかの1行。数と向きで主張を言う1文。評価語なし"),
    notes: z
      .array(inlineText)
      .default([])
      .describe(
        `画像のどこを見るか・何が変わったか。1項目1文で、場所の言葉（左上の帯・2行目の札）から書く。番号は書かない（並びの順に振って描く）。${String(MAX_CANDIDATES)}つまで`,
      ),
    fold,
    aside,
  })
  .describe(
    "手で確かめた画面の画像1枚（何が見えたかを文で言い直さない。見る場所が2つ以上なら notes に並べる）。前後は beforeAfter。入れ子が主役の構成図は d2 で撮った PNG をこの塊で渡してよい（崩れたら graph に戻す）",
  )

const REPORT_FILE_CHANGES = ["added", "modified", "deleted", "read"] as const

const filesBlockSchema = z
  .object({
    kind: z.literal("files"),
    items: z
      .array(
        z.object({
          path: z.string().describe("cwd からの相対パス"),
          change: z.enum(REPORT_FILE_CHANGES),
          note: inlineText.default(""),
        }),
      )
      .min(1),
    title: inlineText
      .default("")
      .describe("何のファイルの一覧か（パスは写さない）。空なら題も番号も出ない"),
    fold,
    aside,
  })
  .describe("触った・読んだファイルの一覧")

const codeBlockSchema = z
  .object({
    kind: z.literal("code"),
    language: z.string().describe("言語名。変更の前後は diff"),
    path: z
      .string()
      .default("")
      .describe(
        "実物の一部を引くときだけ付ける（cwd からの相対パスか絶対パス。`~` は使わない）。" +
          "中身がそのファイルの連続した一部と一致しないと差し戻される。案には付けない",
      ),
    source: z.string().describe("marks の無いコードは45行まで。超えるなら要る範囲だけを引く"),
    marks: z
      .array(
        z.object({
          lines: z.string(),
          label: z.string(),
        }),
      )
      .default([])
      .describe("強調する行（行は `4-8`・`12`）"),
    fold,
    aside,
  })
  .describe(
    "コード・コマンド・エラー文・そのまま渡す前提の文章（デザインの依頼文・コミットメッセージの案など）。" +
      "塊にはクリックでクリップボードへ写せるボタンが付く",
  )

/**
 * mermaid の種類のうち、tsukumo が配る mermaid で描けると確かめたもの（`package.json` で版を固定しているのはこの実測のため）。
 * 挙げていない種類には構文が通らないものが混ざる。
 */
export const REPORT_MERMAID_KINDS = [
  "sequenceDiagram",
  "stateDiagram-v2",
  "classDiagram",
  "erDiagram",
  "mindmap",
  "timeline",
  "gantt",
  "gitGraph",
  "quadrantChart",
] as const

const mermaidBlockSchema = z
  .object({
    kind: z.literal("mermaid"),
    title: inlineText.default("").describe("数と向きで主張を言う1文。評価語なし"),
    source: z
      .string()
      .describe(
        `図のソース。種類は ${REPORT_MERMAID_KINDS.join(" / ")} の${String(REPORT_MERMAID_KINDS.length)}種だけ。flowchart は graph の塊で書く。` +
          "ラベルの引用符・バッククォートは #quot; / #96; と書く",
      ),
    fold,
    aside,
  })
  .describe(
    "時間の順（sequenceDiagram）・状態・クラス・ER など、flowchart 以外の図。「まず…次に…」の地の文で書かない。1枚に1つの話を同じ抽象度で。辺は向きと動詞のラベル付き。交差は並びか分割で解く",
  )

const graphBlockSchema = z
  .object({
    kind: z.literal("graph"),
    title: inlineText.default("").describe("数と向きで主張を言う1文。評価語なし"),
    ...graphFields,
    fold,
    aside,
  })
  .describe(
    "名前が3つ以上出てきて、その間を渡す・呼ぶ・分かれるでつなぐとき（一本道でも段の名前が短ければ graph）。flowchart はこれで書く。1枚に1つの話を同じ抽象度で。どの辺にも向きと動詞のラベルを付ける。交差が出たら節点の並びか図の分け方を変える。群は囲みで言い色で言わない",
  )

const REPORT_CHART_KINDS = ["bar", "line", "pie", "arrow", "slope"] as const

const chartSeriesSchema = z.object({
  name: inlineText.describe("線・棒の端に直接書く系列名"),
  values: z.array(z.number()).min(1),
})

const chartBlockSchema = z
  .object({
    kind: z.literal("chart"),
    title: inlineText.default("").describe("数と向きで主張を言う1文。評価語なし"),
    chartKind: z
      .enum(REPORT_CHART_KINDS)
      .describe(
        "bar は棒・line は折れ線・pie は円（series の先頭だけを描く）。前後の差が主役なら arrow（項目ごとの前→後の矢印）、2時点の多項目は slope（項目ごとの2点の線）。arrow・slope は series を前と後の2つにし、labels を項目にする",
      ),
    labels: inlineText.array().min(1).describe("横軸・扇形の名前の並び（arrow・slope では項目）"),
    series: z
      .array(chartSeriesSchema)
      .min(1)
      .describe("系列ごとの数の並び。各 values の数は labels と揃える"),
    horizontal: z.boolean().default(false).describe("bar のときだけ効く。true で横棒にする"),
    fold,
    aside,
  })
  .describe(
    "数の推移・割合。数が3つ以上で大小や傾きそのものを見せるとき（正確な値を読ませたいなら表）。色は書けない",
  )

const svgBlockSchema = z
  .object({
    kind: z.literal("svg"),
    title: inlineText.default(""),
    ...svgFields,
    fold,
    aside,
  })
  .describe(
    "位置・重なりそのもの（画面の領域の配置・重なり方）を座標で描く。つながりだけなら graph・mermaid。色は書けない",
  )

const progressBlockSchema = z
  .object({
    kind: z.literal("progress"),
    steps: z
      .array(inlineText)
      .min(1)
      .describe("段の名前の並び。空文字の段は tsukumo が1始まりの番号を振る"),
    current: z
      .number()
      .int()
      .min(0)
      .describe("いまの段の位置（0始まり）。全部済んだら steps.length"),
    fold,
    aside,
  })
  .describe(
    "「N のうち M 段目」のように段（フェーズ）の名前と位置が分かっているとき。文字で「N のうち M」と書かない",
  )

const markdownBlockSchema = z.object({
  kind: z.literal("markdown"),
  markdown: z.string().describe("どの塊にも当てはまらない記法（svg・引用・区切り線）だけ"),
  fold,
  aside,
})

// `report` の schema で `figure` と `sections` が共有する塊。名前を外すと両方に複製され、ツール定義が約1万字増える
const namedBeforeAfter = beforeAfterBlockSchema.meta({ id: "BeforeAfterBlock" })
const namedDimension = dimensionBlockSchema.meta({ id: "DimensionBlock" })
const namedStats = statsBlockSchema.meta({ id: "StatsBlock" })
const namedMermaid = mermaidBlockSchema.meta({ id: "MermaidBlock" })
const namedGraph = graphBlockSchema.meta({ id: "GraphBlock" })
const namedChart = chartBlockSchema.meta({ id: "ChartBlock" })
const namedSvg = svgBlockSchema.meta({ id: "SvgBlock" })
const namedImage = imageBlockSchema.meta({ id: "ImageBlock" })

export const reportBlockSchema = z.discriminatedUnion("kind", [
  textBlockSchema,
  listBlockSchema,
  tableBlockSchema,
  matrixBlockSchema,
  compareBlockSchema,
  namedBeforeAfter,
  namedDimension,
  noteBlockSchema,
  namedStats,
  codeBlockSchema,
  namedMermaid,
  namedGraph,
  namedChart,
  namedSvg,
  progressBlockSchema,
  optionsBlockSchema,
  namedImage,
  filesBlockSchema,
  markdownBlockSchema,
])

export type ReportGraph = DeepReadonly<z.infer<z.ZodObject<typeof graphFields>>>

export type ReportBlock = DeepReadonly<z.infer<typeof reportBlockSchema>>

/** レポートの外（質問の添え書き）で図として使える塊。 */
export const figureBlockSchema = z.discriminatedUnion("kind", [
  listBlockSchema,
  tableBlockSchema,
  compareBlockSchema,
  mermaidBlockSchema,
  graphBlockSchema,
  codeBlockSchema,
  imageBlockSchema,
])

export type FigureBlock = DeepReadonly<z.infer<typeof figureBlockSchema>>

/** `report` の `figure` に図を置かない理由。 */
export const REPORT_FIGURE_NONE_REASONS = [
  "short-answer",
  "no-shape",
  "single-value",
  "no-material",
] as const

/** `report` の `figure`（レポートの図1つか、置かない理由）。図の塊は `sections` の同じ種類の塊と同じ形。 */
export const reportFigureSchema = z.discriminatedUnion("kind", [
  namedImage,
  namedMermaid,
  namedGraph,
  namedSvg,
  namedBeforeAfter,
  namedChart,
  namedStats,
  namedDimension,
  z.object({ kind: z.literal("none"), reason: z.enum(REPORT_FIGURE_NONE_REASONS) }),
])

export type ReportFigure = DeepReadonly<z.infer<typeof reportFigureSchema>>

/**
 * 読み戻した `figure`。`unrecorded` は `figure` の欄が無かったころの呼び出しと形の崩れで、
 * 書き手には出さない（{@link reportFigureSchema} の理由には入れない）。
 */
export type RecordedReportFigure =
  | ReportFigure
  | { readonly kind: "none"; readonly reason: "unrecorded" }

export type RecordedFigureNoneReason = Extract<
  RecordedReportFigure,
  { readonly kind: "none" }
>["reason"]

/**
 * `figure` の図を見出しの無い先頭の節にした、描く順（figure → sections）の並び。`none` なら `sections` のまま。
 * 図の番号と、図の不具合の位置（何個目か）はこの並びで数える。
 */
export function sectionsWithFigure(
  figure: RecordedReportFigure,
  sections: readonly ReportSection[],
): readonly ReportSection[] {
  return figure.kind === "none" ? sections : [{ heading: "", blocks: [figure] }, ...sections]
}

export const reportSectionSchema = z.object({
  heading: z
    .string()
    .default("")
    .describe(
      `その節の結論を言う語（「変更点」「まとめ」のようなどのレポートにも当てはまる語にしない）。${String(MAX_HEADING)}字以内で、疑問文にしない。節が1つなら省いてよく、2つ以上なら全部に付ける`,
    ),
  blocks: z.array(reportBlockSchema).min(1),
})

export type ReportSection = DeepReadonly<z.infer<typeof reportSectionSchema>>

/**
 * 配列を読み取り専用の型に畳む。`z.array(...).readonly()` は JSON Schema に `readOnly: true` を
 * 出す（`tool` に渡す `report` の引数がこれで膨らむ）ので、型だけをここで付け直す。
 */
type DeepReadonly<T> = T extends readonly (infer U)[]
  ? readonly DeepReadonly<U>[]
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T

/**
 * 文字列の本文（`sections` に切り替える前の `report` の `body`）を節に畳む。空白だけなら節は無く、それ以外は見出しの無い節1つに
 * 逃げ道の塊1つ。頭の空行と末尾の空白は落とす（描いた見た目は変わらず、送り直しの判定で空白の差を見ないため）。
 */
export function reportSectionsOfBody(body: string): readonly ReportSection[] {
  const markdown = body.replace(/^(?:[ \t]*\n)+/, "").trimEnd()
  return markdown === ""
    ? []
    : [{ heading: "", blocks: [{ kind: "markdown", markdown, fold: "", aside: "" }] }]
}

/**
 * `reportBlockSchema` が知っている塊の種類。`reportBlockSchema` の枝から導き、塊を1種類足して
 * ここへ書き忘れる経路を型で塞ぐ（列挙し直すと `satisfies` は部分集合しか検査しない）。
 */
export const REPORT_BLOCK_KINDS: readonly ReportBlock["kind"][] = reportBlockSchema.options.map(
  (option) => option.shape.kind.value,
)

export type ParsedReportSections = {
  readonly sections: readonly ReportSection[]
  /** 知らない種類（{@link REPORT_BLOCK_KINDS} に無い `kind`）で落とした塊の数。 */
  readonly unknownBlockCount: number
}

/**
 * `report` の引数の `sections` を取り出す。塊ごとに検証し、崩れた塊と知らない種類の塊は落とす
 * （塊1つの読み損ねでレポートを捨てない）。塊が残らない節と、配列でない値は無いものとする。
 */
export function parseReportSections(value: unknown): ParsedReportSections {
  const sections = z.array(z.unknown()).safeParse(value)
  if (!sections.success) {
    return { sections: [], unknownBlockCount: 0 }
  }
  const parsed = sections.data.flatMap((candidate) => {
    const section = looseSectionSchema.safeParse(candidate)
    return section.success ? [section.data] : []
  })
  return {
    sections: parsed.flatMap(({ heading, blocks }) => {
      const valid = blocks.flatMap((block) => {
        const parsedBlock = reportBlockSchema.safeParse(block)
        return parsedBlock.success ? [parsedBlock.data] : []
      })
      return valid.length === 0 ? [] : [{ heading, blocks: valid }]
    }),
    unknownBlockCount: parsed.flatMap(({ blocks }) => blocks).filter(isUnknownKindBlock).length,
  }
}

/** `report` の引数の `figure` を取り出す。無い・崩れたものは `unrecorded` に畳む。 */
export function parseReportFigure(value: unknown): RecordedReportFigure {
  const figure = reportFigureSchema.safeParse(value)
  return figure.success ? figure.data : { kind: "none", reason: "unrecorded" }
}

/** 塊を1つずつ検証するために、節の見出しだけを先に読む形。 */
const looseSectionSchema = z.object({
  heading: reportSectionSchema.shape.heading,
  blocks: z.array(z.unknown()),
})

const blockKindSchema = z.object({ kind: z.string() })

function isUnknownKindBlock(block: unknown): boolean {
  const kind = blockKindSchema.safeParse(block)
  return kind.success && !REPORT_BLOCK_KINDS.some((known) => known === kind.data.kind)
}
