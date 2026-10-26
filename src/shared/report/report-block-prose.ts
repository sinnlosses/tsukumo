// 文・並び・注記・ファイル・コード・段・確度つきの主張・逃げ道の塊の形。

import { z } from "zod"

import { aside, fold, inlineText, omittable } from "./report-block-field.ts"
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
    .enum(["bullet", "ordered", "check", "flow", "cards"])
    .describe(
      "bullet は発見の一覧（項目ごとに言うことが2つ以上なら表）/ ordered は順番に意味がある手順 / check は済み（done）と未了が混じる並び / " +
        "flow は段ごとに文が要る一本道（A → B → C と書かず項目を段にする。段の名前が短い一本道・分岐・合流・戻りがあるなら graph）/ " +
        "cards は読む順・因果の無い2〜4枚の並列（label 必須）",
    ),
  items: z
    .array(
      z.object({
        label: omittable(inlineText, "").describe(
          `名前と説明の対の名前（「名前: 説明」と text に書かず、名前をここに分ける。${String(MAX_ITEM_LABEL)}字以内）`,
        ),
        text: inlineText,
        done: omittable(z.boolean(), false),
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
    .describe(
      "info は結論 / warn は注意 / ng は異常 / ask は答えの出ていない問い（確かめていないことは claims） / memo は覚え書き",
    ),
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
          note: omittable(inlineText, ""),
        }),
      )
      .min(1),
    title: omittable(inlineText, "").describe(
      "何のファイルの一覧か（パスは写さない）。空なら題も番号も出ない",
    ),
    fold,
    aside,
  })
  .describe("触った・読んだファイルの一覧")

export const codeBlockSchema = z
  .object({
    kind: z.literal("code"),
    language: z.string().describe("言語名。変更の前後は diff"),
    path: omittable(z.string(), "").describe(
      "実物の一部を引くときだけ付ける（cwd からの相対パスか絶対パス。`~` は使わない）。" +
        "中身がそのファイルの連続した一部と一致しないと差し戻される。案には付けない",
    ),
    source: z.string().describe("marks の無いコードは45行まで"),
    marks: omittable(
      z.array(
        z.object({
          lines: z.string(),
          label: z.string(),
        }),
      ),
      [],
    ).describe("強調する行（行は `4-8`・`12`）"),
    fold,
    aside,
  })
  .describe(
    "コード・コマンド・エラー文・そのまま渡す前提の文章（デザインの依頼文・コミットメッセージの案など）。" +
      "塊にはクリックでクリップボードへ写せるボタンが付く",
  )

const REPORT_CLAIM_CERTAINTIES = ["confirmed", "inferred", "unverified"] as const

export const claimsBlockSchema = z
  .object({
    kind: z.literal("claims"),
    items: z
      .array(
        z
          .object({
            claim: inlineText,
            certainty: z.enum(REPORT_CLAIM_CERTAINTIES),
            basis: omittable(inlineText, "").describe("path:line か [ドメイン](URL)"),
            howToVerify: omittable(inlineText, "").describe(
              "確定でなければ必須。繰り返せる手順を1文で",
            ),
          })
          .refine((item) => item.certainty === "confirmed" || item.howToVerify.trim() !== "", {
            message: "確定でない項目は howToVerify に確かめ方を書く",
            path: ["howToVerify"],
          }),
      )
      .min(1)
      .describe("10件まで"),
    fold,
    aside,
  })
  .describe(
    "確かめていないこと・推測を、主張ごとに確度・根拠・確かめ方で1行ずつ書く。テスト・型検査の結果は checks",
  )

export const markdownBlockSchema = z.object({
  kind: z.literal("markdown"),
  markdown: z
    .string()
    .describe(
      "どの塊にも当てはまらない記法（svg・引用・区切り線・区画の格子 cols / card・札 badge）だけ",
    ),
  fold,
  aside,
})
