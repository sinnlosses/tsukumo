// いまのセッションのコンテキストの内訳（`docs/glossary.md`「コンテキストの内訳」）と、それを
// 配る経路の名前。**サーバ（`src/server/view-server/adapter/server.ts` が配る）とブラウザ（トークン消費の
// 画面が取りに行く）の両方が同じ値を見る**ので shared に置く（`token-usage-summary.ts` と同じ
// 考え方。ここは値と型だけで `node:` にも `document` にも触らない）。
//
// **SDK の形をそのまま運ばない。** 画面が要る数と名前だけに写したのがここの型で、SDK の戻り値
// （`getContextUsage()`）からの写しと検証は `src/server/session-driver/adapter/sdk-context-usage.ts` が1箇所で行う。
//
// **運ぶのは数と名前だけ** — メモリファイルのパス・スキル名・MCP ツール名・分類の表示名で、
// 会話の文面は入らない（メッセージは分類1行の数として出るだけ。
// `docs/coding-standards.md`「会話内容の扱い」）。
//
// **起動トークンが要る経路**（`/token-usage` と同じ形で `?t=` を付ける）。配るのは利用者の
// セッションが何を積んでいるかで、同梱物や素材と違って誰にでも配ってよい静的な物ではない。

import { z } from "zod"

/** 内訳の経路（`GET /context-usage?t=<起動トークン>`）。 */
export const CONTEXT_USAGE_PATH = "/context-usage"

/**
 * 分類1行の種別。**分類の判定はこれで行い、`name`（英語の表示名）では判定しない**
 * （SDK の型の説明に明記されている）。`used` は窓を占める中身、`free` は残り、`buffer` は
 * 自動圧縮のために空けてある分、`deferred` は**窓の外**にあるツールの定義
 * （数えはするが使用量には入らない）。
 */
export const CONTEXT_CATEGORY_KINDS = ["used", "free", "buffer", "deferred"] as const

export type ContextCategoryKind = (typeof CONTEXT_CATEGORY_KINDS)[number]

/** 分類1行（`name` は SDK が出す英語の表示名。日本語への置き換えは描く側が持つ）。 */
export type ContextUsageCategory = {
  readonly name: string
  readonly tokens: number
  readonly kind: ContextCategoryKind
}

/**
 * 内訳の表に並ぶ1件（MCP ツール・メモリファイル・スキル）。**3つを同じ形にしてある**のは、
 * 出どころの呼び名が違うだけで、画面が要るのが「名前・どこから来たか・トークン数」の3つで
 * 同じだから（MCP はサーバ名、メモリファイルは種別（`Project` など）、スキルは
 * 出どころ（`userSettings` など）が `source` に入る）。
 */
export type ContextUsageItem = {
  readonly name: string
  readonly source: string
  readonly tokens: number
}

/** いまのセッションのコンテキストの内訳。 */
export type ContextUsage = {
  /** 内訳を計算したモデル（SDK が返す名前をそのまま）。 */
  readonly model: string
  /** 使っている量の見積もり（`used` の分類の合計）。 */
  readonly totalTokens: number
  /** 使用量を測る相手になる窓の大きさ（SDK の `rawMaxTokens`）。 */
  readonly maxTokens: number
  /** 使っている割合（0〜100+。SDK が丸めた値をそのまま）。 */
  readonly percentage: number
  /** 分類ごとの行（SDK が並べた順のまま）。 */
  readonly categories: readonly ContextUsageCategory[]
  readonly mcpTools: readonly ContextUsageItem[]
  readonly memoryFiles: readonly ContextUsageItem[]
  /** スキル1つずつ（トークンを持つスキルが無いときは空）。 */
  readonly skills: readonly ContextUsageItem[]
}

/**
 * 内訳の問い合わせの結果。**判別可能な合併型**にしてあるのは、「取れた」と「取れない」が
 * 画面の別の見せ方（札を出す / 一言だけ出す）に対応する別の状態だから
 * （`docs/coding-standards.md`「「無いかもしれない」値」）。**「まだ起きていない」と
 * 「取れなかった」は分けない** — どちらも画面ですることが同じ（待って取り直す）で、
 * 分けても利用者の手が変わらない。
 */
export type ContextUsageReport =
  | { readonly kind: "ready"; readonly usage: ContextUsage }
  | { readonly kind: "unavailable" }

/** 取れなかったときの結果。 */
export const UNAVAILABLE_CONTEXT_USAGE = { kind: "unavailable" } satisfies ContextUsageReport

const contextUsageItemSchema = z.object({
  name: z.string(),
  source: z.string(),
  tokens: z.number(),
})

/** 配る形そのもの（{@link ContextUsageReport} と同じ鍵）。 */
const contextUsageReportSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("ready"),
    usage: z.object({
      model: z.string(),
      totalTokens: z.number(),
      maxTokens: z.number(),
      percentage: z.number(),
      categories: z.array(
        z.object({
          name: z.string(),
          tokens: z.number(),
          kind: z.enum(CONTEXT_CATEGORY_KINDS),
        }),
      ),
      mcpTools: z.array(contextUsageItemSchema),
      memoryFiles: z.array(contextUsageItemSchema),
      skills: z.array(contextUsageItemSchema),
    }),
  }),
  z.object({ kind: z.literal("unavailable") }),
])

/**
 * 届いた JSON を内訳として読む。**読めない形のときは「取れない」**（`readTokenUsageSummary` と
 * 同じ割り切り。画面は取れなかったときと同じ見た目になるだけで落ちない）。
 */
export function readContextUsageReport(value: unknown): ContextUsageReport {
  const parsed = contextUsageReportSchema.safeParse(value)
  return parsed.success ? parsed.data : UNAVAILABLE_CONTEXT_USAGE
}
