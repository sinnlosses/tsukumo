// いまのコンテキストの内訳（`docs/glossary.md`「コンテキストの内訳」）を SDK に問い合わせ、
// 画面が要る形（src/shared/context-usage.ts）へ写す。問い合わせる相手は駆動
// （src/server/adapter/sdk-driver.ts）が回している `query()` の戻り値。

import { z } from "zod"

import {
  CONTEXT_CATEGORY_KINDS,
  type ContextUsageReport,
  UNAVAILABLE_CONTEXT_USAGE,
} from "../../shared/context-usage.ts"

/**
 * コンテキストの内訳を取るときの細かさ。**`'full'` に固定する**（分類ごとに token-count API で
 * 数えた値が返る）。`'summary'` は直前の応答の usage と手元の見積もりで答えるので、合計は同じ
 * でも**分類ごとの値が実測で最大2倍ずれる**（メモリファイル 12244 → 5730、システムツール
 * 8686 → 14612）。画面に出すのが分類ごとの内訳そのものなので、ずれた値では読めない。
 * **待たされるのは初回だけ**（実測: 初回 571ms、2回目以降 8-16ms。本体側が数えた結果を持つ）。
 */
const CONTEXT_USAGE_DETAIL = "full"

/**
 * {@link readContextUsage} が要る口だけを写した形。**`query()` の戻り値そのものを引数に取らない**
 * のは、本物のセッションを起こさずに写しを検査できるようにするため。
 */
type ContextUsageSource = {
  readonly getContextUsage: (opts: { readonly detail: "full" }) => Promise<unknown>
}

/**
 * SDK が返す内訳のうち**画面が要る鍵だけ**を見るスキーマ（外の世界の値なので境界で検証する。
 * `docs/coding-standards.md`「型を迂回するキャストを使わない」）。知らない鍵は zod が落とすので、
 * SDK 側に鍵が増えても写しは変わらない。
 */
const sdkContextUsageSchema = z.object({
  model: z.string(),
  totalTokens: z.number(),
  rawMaxTokens: z.number(),
  percentage: z.number(),
  categories: z.array(
    z.object({ name: z.string(), tokens: z.number(), kind: z.enum(CONTEXT_CATEGORY_KINDS) }),
  ),
  mcpTools: z.array(z.object({ name: z.string(), serverName: z.string(), tokens: z.number() })),
  memoryFiles: z.array(z.object({ path: z.string(), type: z.string(), tokens: z.number() })),
  skills: z
    .object({
      skillFrontmatter: z.array(
        z.object({ name: z.string(), source: z.string(), tokens: z.number() }),
      ),
    })
    .optional(),
})

/**
 * いまのコンテキストの内訳を SDK に問い合わせる（`docs/glossary.md`「コンテキストの内訳」）。
 * **取れなかった回は「取れない」を返すだけ**で、例外は外へ出さない。
 *
 * **ターンの実行中に呼んでも待たされない**（実測: 実行中の呼び出しが13ms で返り、値は直前の
 * 応答までの積み上がりを指す）。だから画面は進行中でも同じ経路で取りに行く。
 */
export async function readContextUsage(session: ContextUsageSource): Promise<ContextUsageReport> {
  try {
    return toContextUsage(await session.getContextUsage({ detail: CONTEXT_USAGE_DETAIL }))
  } catch {
    return UNAVAILABLE_CONTEXT_USAGE
  }
}

/**
 * SDK が返した内訳を tsukumo の形に写す（**SDK の語彙を外へ出さない**）。読めない形のときは
 * 「取れない」（届く形が変わっても画面は札を1枚落とすだけで、他は動き続ける）。
 *
 * **`skills` は1件ずつの並びではなく、まとめの中の `skillFrontmatter` に入っている**ので、
 * そこから取り出して他の2つと同じ形に揃える。`rawMaxTokens` のほうを窓の大きさに使うのは、
 * 使用量を測る相手がそれだと SDK の型の説明にあるため。
 *
 * **本物の `query()` を呼ばずに写しを検査できるように**、`startSdkDriver` の外に出して公開して
 * ある（`sdk-driver.ts` の `buildQuerySeedOptions` と同じ理由）。
 */
export function toContextUsage(value: unknown): ContextUsageReport {
  const parsed = sdkContextUsageSchema.safeParse(value)
  if (!parsed.success) {
    return UNAVAILABLE_CONTEXT_USAGE
  }

  const usage = parsed.data
  return {
    kind: "ready",
    usage: {
      model: usage.model,
      totalTokens: usage.totalTokens,
      maxTokens: usage.rawMaxTokens,
      percentage: usage.percentage,
      categories: usage.categories,
      mcpTools: usage.mcpTools.map((mcpTool) => ({
        name: mcpTool.name,
        source: mcpTool.serverName,
        tokens: mcpTool.tokens,
      })),
      memoryFiles: usage.memoryFiles.map((memoryFile) => ({
        name: memoryFile.path,
        source: memoryFile.type,
        tokens: memoryFile.tokens,
      })),
      skills: usage.skills?.skillFrontmatter ?? [],
    },
  }
}
