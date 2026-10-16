// 切り替え画面の右に出す、選んでいるセッション1件の中身。
// 中身は transcript から読むもの（依頼の数・claude が `report` の `sessionSummary` に書いた要約と `sessionRemaining` に書いた残り・最後のセリフ）で、会話の文面を含む。
// 127.0.0.1 のビューへ出すだけで、ログ・ファイル・外部へは出さない。依頼の文面そのものは入れない。

import { z } from "zod"

/** 要約として配る文字数の上限。`report` の引数には上限を掛けない（長すぎる要約のためにレポートそのものを差し戻さない）ので、読む側がこれで切る。 */
export const MAX_SESSION_SUMMARY_LENGTH = 1200

/**
 * `report` の `sessionRemaining` を記録に写したもの。
 * `none` は残りが無いと書かれた（空白だけを含む）、`unrecorded` は欄の無かった頃の呼び出し（形の崩れも）。
 */
export type SessionRemaining =
  | { readonly kind: "none" }
  | { readonly kind: "remaining"; readonly text: string }
  | { readonly kind: "unrecorded" }

export type SessionDigest =
  | {
      readonly kind: "known"
      /** 利用者が送った依頼の数。 */
      readonly requestCount: number
      /** 最後に通った `report` の `sessionSummary`。書かれていなければ undefined。 */
      readonly summary: string | undefined
      /** 最後に通った `report` の残っていること。無ければ undefined。 */
      readonly remaining: string | undefined
      /** 最後のセリフ（`speak` か `report` の締め）。1つも無ければ undefined。 */
      readonly lastLine: string | undefined
    }
  /** 読めなかった・一覧に無いIDを頼まれた。 */
  | { readonly kind: "unavailable" }

/**
 * JSON の上では undefined の欄が消えて届くので、受け取った側で欄を揃え直す
 * （{@link SessionDigest} の「無い」は欄ごと省かず undefined で持つ）。
 */
export const sessionDigestSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("known"),
      requestCount: z.number().int().nonnegative(),
      summary: z.string().optional(),
      remaining: z.string().optional(),
      lastLine: z.string().optional(),
    })
    .transform((digest): SessionDigest => ({
      kind: "known",
      requestCount: digest.requestCount,
      summary: digest.summary,
      remaining: digest.remaining,
      lastLine: digest.lastLine,
    })),
  z.object({ kind: z.literal("unavailable") }),
])

export const UNAVAILABLE_SESSION_DIGEST = {
  kind: "unavailable",
} as const satisfies SessionDigest

/** 要約を段落に割る（空行でも改行1つでも段落の切れ目にする）。 */
export function summaryParagraphs(summary: string): readonly string[] {
  return summary
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line !== "")
}
