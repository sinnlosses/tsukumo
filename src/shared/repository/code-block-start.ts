// `Code` の塊の頭の行が、git 管理下のファイルの何行目に当たるか。行番号の列の始まりに使う。
// 運ぶのは塊の言語・パス・中身で、返すのは行番号だけ。リポジトリのファイルの中身も塊の中身もログには出さない。

import { z } from "zod"

import { MAX_REPOSITORY_PATH_LENGTH } from "./repository-file-list.ts"

/** 塊の中身として受ける字数（UTF-16 の単位）の上限。超えたら契約が断る。 */
const MAX_CODE_BLOCK_SOURCE_LENGTH = 200_000

export const codeBlockStartRequestSchema = z.object({
  path: z.string().min(1).max(MAX_REPOSITORY_PATH_LENGTH),
  language: z.string().max(200),
  source: z.string().max(MAX_CODE_BLOCK_SOURCE_LENGTH),
})

export type CodeBlockStartRequest = z.infer<typeof codeBlockStartRequestSchema>

/** `unknown` は、管理下でない・読めない・一致が1か所に決まらないなど、行番号を出さない場合すべて。 */
export const codeBlockStartSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("line"), startLine: z.number().int().min(1) }),
  z.object({ kind: z.literal("unknown") }),
])

export type CodeBlockStart = z.infer<typeof codeBlockStartSchema>

export const UNKNOWN_CODE_BLOCK_START = { kind: "unknown" } as const satisfies CodeBlockStart
