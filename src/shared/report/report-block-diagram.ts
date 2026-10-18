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
import { MAX_CANDIDATES } from "./report-limit.ts"

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
      width: positiveNumber,
      height: positiveNumber,
      label: omittable(inlineText, "").describe("枠の中に出す名前。無ければ空"),
      emphasis: omittable(z.boolean(), false).describe("true で枠を強調する"),
    }),
    z.object({
      kind: z.literal("line"),
      x1: z.number(),
      y1: z.number(),
      x2: z.number(),
      y2: z.number(),
      arrow: omittable(z.boolean(), false).describe("true で終点（x2, y2）に矢じりを付ける"),
      label: omittable(inlineText, "").describe("線に添える語。無ければ空"),
    }),
    z.object({ kind: z.literal("text"), x: z.number(), y: z.number(), text: inlineText }),
  ])
  .meta({ id: "SvgShape" })

const svgFields = {
  width: positiveNumber.describe("viewBox の幅。図形はこの内側に収める"),
  height: positiveNumber.describe("viewBox の高さ。図形はこの内側に収める"),
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
    z.object({
      kind: z.literal("points"),
      points: z
        .array(inlineText)
        .min(1)
        .describe(`短い1行の並び。${String(MAX_CANDIDATES)}つまで`),
    }),
  ])
  .meta({ id: "BeforeAfterSide" })

export const beforeAfterBlockSchema = z
  .object({
    kind: z.literal("beforeAfter"),
    title: inlineText.describe("何の前後か"),
    before: beforeAfterSideSchema,
    after: beforeAfterSideSchema,
    fold,
    aside,
  })
  .describe(
    "変更の前と後を左に前・右に後で並べ、間に矢印を置く（画面の撮影・構造の前後）。1行の設定や文言の変更には使わない。ファイル名の箇条書きで変更を説明しない。側ごとに image / code / points / mermaid / svg のどれか（左右で違ってよい）。時間の順の前後は mermaid の側。" +
      "数の前後は stats の before、行ごとの差分は code の diff、寸法の前後は dimension の before",
  )

const dimensionBefore = omittable(z.string(), "").describe("変わる前の値（前後を見せるときだけ）")

export const dimensionBlockSchema = z
  .object({
    kind: z.literal("dimension"),
    title: inlineText,
    parts: z
      .array(
        z.union([
          z.object({
            name: inlineText,
            size: omittable(z.string(), "").describe(
              "領域の寸法（字 21px・高さ 56px）。無ければ空",
            ),
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

export const imageBlockSchema = z
  .object({
    kind: z.literal("image"),
    path: z.string().describe("撮った画像のファイル（絶対か cwd から。png・jpeg・gif・webp）"),
    caption: inlineText.describe("何が見えるかの1行。数と向きで主張を言う1文。評価語なし"),
    notes: omittable(z.array(inlineText), []).describe(
      `画像のどこを見るか・何が変わったか。1項目1文で、場所の言葉（左上の帯・2行目の札）から書く。番号は書かない（並びの順に振って描く）。${String(MAX_CANDIDATES)}つまで`,
    ),
    fold,
    aside,
  })
  .describe(
    "手で確かめた画面の画像1枚（何が見えたかを文で言い直さない。見る場所が2つ以上なら notes に並べる）。入れ子が主役の構成図は d2 で撮った PNG をこの塊で渡してよい（崩れたら graph に戻す）",
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
    "時間の順（sequenceDiagram）・状態・クラス・ER など、flowchart 以外の図。「まず…次に…」の地の文で書かない。1枚に1つの話を同じ抽象度で。辺は向きと動詞のラベル付き。交差は並びか分割で解く",
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
    "名前が3つ以上出てきて、その間を渡す・呼ぶ・分かれるでつなぐとき（一本道でも段の名前が短ければ graph）。flowchart はこれで書く。1枚に1つの話を同じ抽象度で。どの辺にも向きと動詞のラベルを付ける。交差が出たら節点の並びか図の分け方を変える。群は囲みで言い色で言わない",
  )

export type ReportGraph = DeepReadonly<z.infer<z.ZodObject<typeof graphFields>>>

const REPORT_CHART_KINDS = ["bar", "line", "pie", "arrow", "slope", "span", "share"] as const

const chartSeriesSchema = z.object({
  name: inlineText.describe("線・棒の端に直接書く系列名"),
  values: z.array(z.number()).min(1),
})

export const chartBlockSchema = z
  .object({
    kind: z.literal("chart"),
    title: omittable(inlineText, "").describe("数と向きで主張を言う1文。評価語なし"),
    chartKind: z
      .enum(REPORT_CHART_KINDS)
      .describe(
        "bar は棒・line は折れ線・pie は円（series の先頭だけを描く）。前後の差が主役なら arrow（項目ごとの前→後の矢印）、2時点の多項目は slope（項目ごとの2点の線）。arrow・slope は series を前と後の2つにし、labels を項目にする。段の所要と重なりのように項目ごとの始まり〜終わりの区間は span（series は始まりと終わりの2つ、labels が項目）、全体に占める割合の内訳は share（100% の横棒1本。labels が部分の名前で、series の先頭だけを描く）",
      ),
    labels: inlineText
      .array()
      .min(1)
      .describe("横軸・扇形の名前の並び（arrow・slope・span では項目、share では部分の名前）"),
    series: z
      .array(chartSeriesSchema)
      .min(1)
      .describe("系列ごとの数の並び。各 values の数は labels と揃える"),
    horizontal: omittable(z.boolean(), false).describe("bar のときだけ効く。true で横棒にする"),
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
  .describe(
    "位置・重なりそのもの（画面の領域の配置・重なり方）を座標で描く。つながりだけなら graph・mermaid",
  )
