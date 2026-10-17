// レポートに書かれた `path:line` の照らし合わせに出す、git 管理下のファイルの行の抜き書き。
// 運ぶのは指した行の前後の数行だけで、ファイルを丸ごとは運ばない。
// リポジトリのファイルの中身なので、ログには出さない。

import { z } from "zod"

import { MAX_REPOSITORY_PATH_LENGTH } from "./repository-file-list.ts"

/** 抜き書きの行数の上限。 */
export const MAX_EXCERPT_LINES = 15

/** 1行として運ぶ字数（コードポイント）の上限。超えた分は落として `truncated` を立てる。 */
export const MAX_EXCERPT_LINE_LENGTH = 200

/** 頼める行番号の上限。形の検査ではなく素朴な上限。 */
const MAX_LINE_NUMBER = 10_000_000

const lineNumberSchema = z.number().int().min(1).max(MAX_LINE_NUMBER)

/** 指した行の範囲（`path:12` なら 12 から 12、`path:10-14` なら 10 から 14）。 */
export const fileExcerptRequestSchema = z
  .object({
    path: z.string().min(1).max(MAX_REPOSITORY_PATH_LENGTH),
    startLine: lineNumberSchema,
    endLine: lineNumberSchema,
  })
  .refine((request) => request.endLine >= request.startLine)

export type FileExcerptRequest = {
  /** cwd 相対のパス。 */
  readonly path: string
  readonly startLine: number
  readonly endLine: number
}

export type FileExcerptLine = {
  /** 1 から数えた行番号。 */
  readonly number: number
  readonly text: string
  /** 字数の上限で後ろを落としたか。 */
  readonly truncated: boolean
}

/** 抜き書きを出さない理由。 */
export const FILE_EXCERPT_UNAVAILABLE_REASONS = [
  "untracked",
  "too-large",
  "binary",
  "unreadable",
] as const

export type FileExcerptUnavailableReason = (typeof FILE_EXCERPT_UNAVAILABLE_REASONS)[number]

export type FileExcerpt =
  | { readonly kind: "lines"; readonly lines: readonly FileExcerptLine[] }
  /** 指した行の頭がファイルの行数を超えている（レポートを書いたあとにファイルが縮んだ）。 */
  | { readonly kind: "out-of-range"; readonly lineCount: number }
  | { readonly kind: "unavailable"; readonly reason: FileExcerptUnavailableReason }

export const UNREADABLE_FILE_EXCERPT = {
  kind: "unavailable",
  reason: "unreadable",
} as const satisfies FileExcerpt

export const fileExcerptSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("lines"),
    lines: z
      .array(
        z.object({
          number: lineNumberSchema,
          // `max` は UTF-16 の単位で数えるので、コードポイントの上限の2倍。
          text: z.string().max(MAX_EXCERPT_LINE_LENGTH * 2),
          truncated: z.boolean(),
        }),
      )
      .max(MAX_EXCERPT_LINES)
      .readonly(),
  }),
  z.object({ kind: z.literal("out-of-range"), lineCount: z.number().int().nonnegative() }),
  z.object({ kind: z.literal("unavailable"), reason: z.enum(FILE_EXCERPT_UNAVAILABLE_REASONS) }),
])
