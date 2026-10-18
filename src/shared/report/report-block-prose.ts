// 文・並び・注記・ファイル・コード・段・逃げ道の塊の形。

import { z } from "zod"

import { aside, fold, inlineText } from "./report-block-field.ts"
import { MAX_ITEM_LABEL } from "./report-limit.ts"

export const textBlockSchema = z.object({
  kind: z.literal("text"),
  text: inlineText.describe(
    "地の文。3文まで。結論に効く数が3つ以上並び前後か推移を見せるなら stats",
  ),
  fold,
  aside,
})

export const listBlockSchema = z.object({
  kind: z.literal("list"),
  style: z
    .enum(["bullet", "ordered", "check", "flow"])
    .describe(
      "bullet は発見の一覧（項目ごとに言うことが2つ以上なら表）/ ordered は順番に意味がある手順 / check は済み（done）と未了が混じる並び / " +
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
    .describe("10件まで"),
  fold,
  aside,
})

const REPORT_NOTE_TONES = ["info", "warn", "ng", "ask", "memo"] as const

export const noteBlockSchema = z.object({
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

const REPORT_FILE_CHANGES = ["added", "modified", "deleted", "read"] as const

export const filesBlockSchema = z
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

export const codeBlockSchema = z
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
    source: z.string().describe("marks の無いコードは45行まで"),
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

export const progressBlockSchema = z
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

export const markdownBlockSchema = z.object({
  kind: z.literal("markdown"),
  markdown: z.string().describe("どの塊にも当てはまらない記法（svg・引用・区切り線）だけ"),
  fold,
  aside,
})
