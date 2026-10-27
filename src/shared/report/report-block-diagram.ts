// 図・前後・寸法・グラフ・画像の塊の形。

import { z } from "zod"

import { readGraphSource } from "./graph-source.ts"
import {
  aside,
  type DeepReadonly,
  fold,
  inlineText,
  omittable,
  positiveNumber,
} from "./report-block-field.ts"

const SVG_TONES = ["a", "b", "c", "d", "e"] as const

const svgToneSchema = z.enum(SVG_TONES)

const toneLegendSchema = z
  .array(z.object({ tone: svgToneSchema, label: inlineText }))
  .meta({ id: "ToneLegend" })

const graphFields = {
  direction: z.enum(["TD", "LR"]),
  source: z
    .string()
    .refine((value) => readGraphSource(value).nodes.length > 0, "source に箱が1つも無い")
    .describe(
      "1行1矢印。`A -> B: 語`（`: 語` は矢印のラベル。省ける。点線は `A -.> B`。前の箱へ戻る矢印は `A <- B: 語` で、B から A へ戻る戻り道に描く）。`(始点)` は始点・終点、`{分岐?}` は分岐、包みが無ければ処理。同じ名前は同じ箱（包みは最初の1回だけでよい）。`->` の無い行は箱だけの宣言（`名前 | 説明` で説明の1行を足せる。矢印の端の名前には書けない）。変更の前後は行頭に `+ `（足した）・`- `（消した）・`~ `（変えた）を付ける（矢印の行は矢印に、箱だけの行は箱に掛かる。同じ箱に違う印は付けない）。色は行末に ` @a`〜` @e`（箱・矢印・囲みの行。名前に ` @` は書かない）。囲みは `[群の名]` だけの行で始め `[]` だけの行で閉じる（間の行の箱がその群。1階層で入れ子は不可）",
    ),
  legend: omittable(toneLegendSchema, []),
}

const svgShapeSchema = z
  .discriminatedUnion("kind", [
    z.object({
      kind: z.literal("rect"),
      x: z.number(),
      y: z.number(),
      width: positiveNumber,
      height: positiveNumber,
      label: omittable(inlineText, ""),
      sub: omittable(inlineText, ""),
      emphasis: omittable(z.boolean(), false),
      labelAt: omittable(z.enum(["center", "top-left"]), "center").describe(
        "枠の題の位置。入れ子の外側の枠は top-left",
      ),
      tone: omittable(z.enum(["none", ...SVG_TONES]), "none"),
    }),
    z.object({
      kind: z.literal("line"),
      x1: z.number(),
      y1: z.number(),
      x2: z.number(),
      y2: z.number(),
      arrow: omittable(z.boolean(), false),
      label: omittable(inlineText, ""),
      dashed: omittable(z.boolean(), false),
      tone: omittable(z.enum(["none", ...SVG_TONES]), "none"),
    }),
    z.object({ kind: z.literal("text"), x: z.number(), y: z.number(), text: inlineText }),
  ])
  .meta({ id: "SvgShape" })

const svgFields = {
  width: positiveNumber,
  height: positiveNumber,
  shapes: z.array(svgShapeSchema).min(1),
  legend: omittable(toneLegendSchema, []),
}

const beforeAfterSideSchema = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("svg"), ...svgFields }),
    z.object({ kind: z.literal("mermaid"), source: z.string() }),
    z.object({
      kind: z.literal("image"),
      path: z.string().describe("撮った画像のファイル（絶対か cwd から）"),
      region: z
        .object({ left: z.number(), top: z.number(), width: z.number(), height: z.number() })
        .optional()
        .describe("変わった場所の枠（画像に対する%）"),
    }),
    z.object({
      kind: z.literal("code"),
      language: z.string().describe("言語名（diff にせず、その側の中身をそのまま書く）"),
      source: z.string(),
    }),
    z.object({ kind: z.literal("points"), points: z.array(inlineText).min(1) }),
  ])
  .meta({ id: "BeforeAfterSide" })

export const beforeAfterBlockSchema = z
  .object({
    kind: z.literal("beforeAfter"),
    title: inlineText,
    before: beforeAfterSideSchema,
    after: beforeAfterSideSchema,
    fold,
    aside,
  })
  .describe(
    "変更の前と後を左に前・右に後で並べ、間に矢印を置く（画面の撮影・構造の前後）。1行の設定や文言の変更には使わない。ファイル名の箇条書きで変更を説明しない。側ごとに image / code / points / mermaid / svg のどれか（左右で違ってよい）。時間の順の前後は mermaid の側。" +
      "数の前後は stats の before、行ごとの差分は code の diff",
  )

export const imageBlockSchema = z
  .object({
    kind: z.literal("image"),
    path: z.string().describe("撮った画像のファイル（絶対か cwd から）"),
    caption: inlineText.describe("何が見えるかの1行。数と向きで主張を言う1文。評価語なし"),
    notes: omittable(z.array(inlineText), []).describe(
      `画像のどこを見るか・何が変わったか。1項目1文で、場所の言葉（左上の帯・2行目のラベル）から書く。番号は書かない（並びの順に振って描く）`,
    ),
    fold,
    aside,
  })
  .describe(
    "手で確かめた画面の画像1枚（何が見えたかを文で言い直さない。見る場所が2つ以上なら notes に並べる）。他の部品で描けない図（量の流れなど）は、別の道具で描いた図の PNG をこの部品で渡してよい（崩れたら文章と表にする）",
  )

/**
 * mermaid の種類のうち、tsukumo が配る mermaid で描けると確かめたもの（`package.json` で版を固定しているのはこの実測のため）。
 * 挙げていない種類には構文が通らないものが混ざる。
 */
export const REPORT_MERMAID_KINDS = ["sequenceDiagram", "stateDiagram-v2"] as const

export const mermaidBlockSchema = z
  .object({
    kind: z.literal("mermaid"),
    title: omittable(inlineText, "").describe("数と向きで主張を言う1文。評価語なし"),
    source: z
      .string()
      .describe(
        `図のソース。種類は ${REPORT_MERMAID_KINDS.join(" / ")} の${String(REPORT_MERMAID_KINDS.length)}種だけ。` +
          "ラベルの引用符・バッククォートは #quot; / #96; と書く",
      ),
    fold,
    aside,
  })
  .describe(
    "時間の順（sequenceDiagram）・状態（stateDiagram-v2）の図。「まず…次に…」の地の文で書かない。1枚に1つの話を同じ抽象度で。矢印は向きと動詞のラベル付き。交差は並びか分割で解く",
  )

export const graphBlockSchema = z
  .object({
    kind: z.literal("graph"),
    title: omittable(inlineText, "").describe("数と向きで主張を言う1文。評価語なし"),
    ...graphFields,
    fold,
    aside,
  })
  .describe(
    "名前が3つ以上出てきて、その間を渡す・呼ぶ・分かれるでつなぐとき（一本道でも段の名前が短ければ graph）。flowchart はこれで書く。1枚に1つの話を同じ抽象度で。どの矢印にも向きと動詞のラベルを付ける。交差が出たら箱の並びか図の分け方を変える。群は囲みで言い色で言わない。分岐・合流・囲み・点線が無い箱5個以下の一本道は、tsukumo がカードの連鎖で描く（書き手は書き方を変えない）",
  )

export type ReportGraph = DeepReadonly<z.infer<z.ZodObject<typeof graphFields>>>

const REPORT_CHART_KINDS = ["bar", "line", "pie", "arrow", "slope", "span", "share"] as const

const chartSeriesSchema = z.object({
  name: inlineText,
  values: z.array(z.number()).min(1),
})

export const chartBlockSchema = z
  .object({
    kind: z.literal("chart"),
    title: omittable(inlineText, "").describe("数と向きで主張を言う1文。評価語なし"),
    chartKind: z
      .enum(REPORT_CHART_KINDS)
      .describe(
        "bar は棒・line は折れ線・pie は円（series の先頭だけを描く）。前後の差が主役なら arrow（項目ごとの前→後の矢印）、2時点の多項目は slope（項目ごとの2点の線）。arrow・slope は series を前と後の2つにし、labels を項目にする。段の所要と重なりのように項目ごとの始まり〜終わりの区間は span（series は始まりと終わりの2つ、labels が項目。時刻の目盛り・延び・出来事が要るなら timeline）、全体に占める割合の内訳は share（100% の横棒1本。labels が部分の名前で、series の先頭だけを描く）",
      ),
    labels: inlineText.array().min(1),
    series: z.array(chartSeriesSchema).min(1),
    horizontal: omittable(z.boolean(), false),
    emphasis: omittable(inlineText.array(), []).describe(
      "題の主語だけ（labels の一部）。bar・pie・share で差し色",
    ),
    fold,
    aside,
  })
  .describe(
    "数の推移・割合。数が3つ以上で大小や傾きそのものを見せるとき（正確な値を読ませたいなら表）",
  )

export const svgBlockSchema = z
  .object({
    kind: z.literal("svg"),
    title: omittable(inlineText, ""),
    ...svgFields,
    fold,
    aside,
  })
  .describe("位置・重なりを座標で描く。つながりだけなら graph・mermaid")
