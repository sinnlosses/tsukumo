// `report` の本文の節と塊の形と、その検証。
// 形の出どころはここだけ。

import { z } from "zod"

const inlineText = z.string()

// 畳むときの見出し。説明は `REPORT_SECTIONS_DESCRIPTION` に1回だけ書く
// （ここに `.describe` を足すと塊の数だけ繰り返されて JSON Schema が膨らむ）。
const fold = z.string().default("")

const textBlockSchema = z.object({
  kind: z.literal("text"),
  text: inlineText.describe(
    "地の文。3文まで（4文目が要るなら表・箇条書きへ移すか fold で畳む）。結論に効く数が2つ以上並ぶなら stats",
  ),
  fold,
})

const listBlockSchema = z.object({
  kind: z.literal("list"),
  style: z
    .enum(["bullet", "ordered", "check", "flow"])
    .describe(
      "bullet は発見の一覧（候補の採否は options、ファイルは files。項目ごとに言うことが2つ以上なら表）/ ordered は順番に意味がある手順 / check は済み（done）と未了が混じる並び / " +
        "flow は一本道で3段以上辿る流れ（A → B → C と書かず項目を段にする。分岐・合流・戻りがあるなら mermaid の flowchart）",
    ),
  items: z
    .array(
      z.object({
        label: inlineText
          .default("")
          .describe("名前と説明の対の名前（「名前: 説明」と text に書かず、名前をここに分ける）"),
        text: inlineText,
        done: z.boolean().default(false),
      }),
    )
    .min(1),
  fold,
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
    title: inlineText.describe("セルに無いことだけ: 何を並べた表か・並べた基準・数の出どころ"),
    columns: z.array(inlineText).min(2).describe("列は5つまで"),
    rows: z
      .array(z.array(cellSchema))
      .min(1)
      .describe("行ごとのセル。数は columns と揃える。セルは1行、空にせず「なし」と書く"),
    fold,
  })
  .describe(
    "比較・対応・件数。同じ形の項目が2つ以上並んだら表（候補の採否は options、交点が状態だけなら matrix）",
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
          points: z.array(inlineText).min(1).describe("5つまで"),
        }),
      )
      .min(2)
      .max(2),
    fold,
  })
  .describe(
    "2つを同時に見比べる（案A と案B・変更前と後）。側ごとに見出しと短い箇条。採否は options、値を揃えるなら table（3つ以上も table）",
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
  })
  .describe(
    "上から積む領域と、その間の余白・字の大きさの寸法（余白を直した前後）。横並び・重なりは markdown の svg",
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
        }),
      )
      .min(2)
      .max(4),
    fold,
  })
  .describe("結論に効く数（件数・前後の差）。数が2〜4個並び、その数自体が結論のとき")

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
      .describe("候補は5つまで"),
    fold,
  })
  .describe(
    "候補を比べて採る・検討・採らないを言うとき。採る → 検討 → 採らないの順に書く（崩れると差し戻す）。書いた順に1始まりの番号を振って描く",
  )

const imageBlockSchema = z
  .object({
    kind: z.literal("image"),
    path: z.string().describe("撮った画像のファイル（絶対か cwd から。png・jpeg・gif・webp）"),
    caption: inlineText.describe("何が見えるかの1行"),
    notes: z
      .array(inlineText)
      .default([])
      .describe(
        "画像のどこを見るか・何が変わったか。1項目1文で、場所の言葉（左上の帯・2行目の札）から書く。番号は書かない（並びの順に振って描く）。5つまで",
      ),
    fold,
  })
  .describe(
    "手で確かめた画面の画像1枚（何が見えたかを文で言い直さない。見る場所が2つ以上なら notes に並べる）。前後は2つ並べる",
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
    fold,
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
    source: z.string(),
    fold,
  })
  .describe(
    "コード・コマンド・エラー文・そのまま渡す前提の文章（デザインの依頼文・コミットメッセージの案など）。" +
      "塊にはクリックでクリップボードへ全文を写せるボタンが付く",
  )

/**
 * mermaid の種類のうち、tsukumo が配る mermaid で描けると確かめたもの（`package.json` で版を固定しているのはこの実測のため）。
 * 挙げていない種類には構文が通らないものが混ざる。
 */
export const REPORT_MERMAID_KINDS = [
  "flowchart",
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
    title: inlineText.default(""),
    source: z
      .string()
      .describe(
        `図のソース。種類は ${REPORT_MERMAID_KINDS.join(" / ")} の${String(REPORT_MERMAID_KINDS.length)}種だけ（迷ったら flowchart）。` +
          "ラベルの引用符・バッククォートは #quot; / #96; と書く",
      ),
    fold,
  })
  .describe(
    "名前が3つ以上出てきて、その間を渡す・呼ぶ・分かれるでつなぐとき（一本道なら list の flow）",
  )

export const REPORT_CHART_KINDS = ["bar", "line", "pie"] as const

const chartSeriesSchema = z.object({
  name: inlineText.describe("凡例に出す系列名"),
  values: z.array(z.number()).min(1),
})

const chartBlockSchema = z
  .object({
    kind: z.literal("chart"),
    title: inlineText.default(""),
    chartKind: z
      .enum(REPORT_CHART_KINDS)
      .describe("bar は棒・line は折れ線・pie は円。pie は series の先頭だけを描く"),
    labels: inlineText.array().min(1).describe("横軸・扇形の名前の並び"),
    series: z
      .array(chartSeriesSchema)
      .min(1)
      .describe("系列ごとの数の並び。各 values の数は labels と揃える"),
    horizontal: z.boolean().default(false).describe("bar のときだけ効く。true で横棒にする"),
    fold,
  })
  .describe(
    "数の推移・割合。数が3つ以上で大小や傾きそのものを見せるとき（正確な値を読ませたいなら表）。色は書けない",
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
  })
  .describe(
    "「N のうち M 段目」のように段（フェーズ）の名前と位置が分かっているとき。文字で「N のうち M」と書かない",
  )

const markdownBlockSchema = z.object({
  kind: z.literal("markdown"),
  markdown: z.string().describe("どの塊にも当てはまらない記法（svg・引用・区切り線）だけ"),
  fold,
})

export const reportBlockSchema = z.discriminatedUnion("kind", [
  textBlockSchema,
  listBlockSchema,
  tableBlockSchema,
  matrixBlockSchema,
  compareBlockSchema,
  dimensionBlockSchema,
  noteBlockSchema,
  statsBlockSchema,
  codeBlockSchema,
  mermaidBlockSchema,
  chartBlockSchema,
  progressBlockSchema,
  optionsBlockSchema,
  imageBlockSchema,
  filesBlockSchema,
  markdownBlockSchema,
])

export type ReportBlock = DeepReadonly<z.infer<typeof reportBlockSchema>>

export const reportSectionSchema = z.object({
  heading: z
    .string()
    .default("")
    .describe(
      "その節の結論を言う語（「変更点」「まとめ」のようなどのレポートにも当てはまる語にしない）。節が1つなら省いてよく、2つ以上なら全部に付ける",
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
    : [{ heading: "", blocks: [{ kind: "markdown", markdown, fold: "" }] }]
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
