// いまのコンテキストの内訳（`docs/glossary.md`「コンテキストの内訳」）を取りに行き、
// 見た目（`../context-usage-card.tsx`）が算出せずにそのまま描ける形へ畳む
// （docs/design.md 2章「機能の中を分ける」）。
//
// **画面を開いたときに1回引く**（押されてくる値ではない。`/token-usage` と同じ経路の形で、
// サーバが駆動へ問い合わせて返す）。**ターンの実行中に呼んでも待たされない**ので、進行中でも
// 同じように取りに行く（実測は `src/server/adapter/sdk-context-usage.ts` の `CONTEXT_USAGE_DETAIL`）。
//
// **「取れなかった」は理由を問わず1つに畳む**（応答が落ちた・読めない形は区別しない。
// 画面ですることが同じなので `use-token-usage.ts` と同じ畳み方）。**「まだ届いていない」は
// 別の種類にする**（骨組みを出すか一言を出すかで見た目が変わるため。`query.isPending` から
// 導くので `useEffect` は要らない）。

import { useQuery } from "@tanstack/react-query"

import {
  type ContextCategoryKind,
  CONTEXT_USAGE_PATH,
  type ContextUsage,
  type ContextUsageItem,
  type ContextUsageReport,
  readContextUsageReport,
  UNAVAILABLE_CONTEXT_USAGE,
} from "../../../../shared/context-usage.ts"
import { sessionTokenUrl } from "../../../lib/session-token-url.ts"

/** 横棒の一区間と、凡例の1行（**同じ並びを両方が使う**ので、色と名前が必ず対になる）。 */
export type ContextUsageRow = {
  /** SDK が返した分類の名前（日本語への置き換えと色は `../context-usage-category.ts`）。 */
  readonly name: string
  readonly kind: ContextCategoryKind
  readonly tokens: number
  /** 窓の大きさに対する割合（%）。横棒の幅になる。 */
  readonly share: number
}

/**
 * 札1枚を描くために要るもの。**判別可能な合併型**で、取れないときは札そのものを出さない
 * （`src/shared/context-usage.ts` の {@link ContextUsageReport} と同じ割り方）。
 * `pending` は届く前の骨組み用、`unavailable` は取れなかったときの一言用。
 */
export type UseContextUsageResult =
  | { readonly kind: "pending" }
  | { readonly kind: "unavailable" }
  | {
      readonly kind: "ready"
      readonly model: string
      readonly totalTokens: number
      readonly maxTokens: number
      readonly percentage: number
      /** 自動圧縮が始まるまでの残り（= 空きの分類のトークン数）。 */
      readonly untilCompactTokens: number
      /** 横棒と凡例（中身 → 空き → 自動圧縮バッファの順）。 */
      readonly rows: readonly ContextUsageRow[]
      /** 窓の外にあるツールの定義（横棒には積まない）。 */
      readonly deferredRows: readonly ContextUsageRow[]
      readonly mcpTools: readonly ContextUsageItem[]
      readonly memoryFiles: readonly ContextUsageItem[]
      readonly skills: readonly ContextUsageItem[]
      /** この内訳を取った時刻（エポックミリ秒）。 */
      readonly takenAt: number
    }

export function useContextUsage(): UseContextUsageResult {
  const query = useQuery({
    queryKey: ["context-usage"],
    queryFn: fetchContextUsage,
    // 開くたびに取り直す（読んでいる間にも積み上がるので、前に開いたときの内訳を見せない）。
    staleTime: 0,
  })
  // 初回の応答がまだ無い間は骨組み（`query.isPending` から導くだけで `useEffect` は要らない）。
  if (query.isPending) {
    return { kind: "pending" }
  }
  return toCard(query.data ?? UNAVAILABLE_CONTEXT_USAGE, query.dataUpdatedAt)
}

/**
 * 届いた内訳を札の形へ畳む。**横棒と凡例が同じ並びを見る**ように、中身・空き・自動圧縮
 * バッファをこの順で1本の並びにする（`deferred` は窓の外なので別の並び）。
 */
function toCard(report: ContextUsageReport, takenAt: number): UseContextUsageResult {
  if (report.kind !== "ready") {
    return { kind: "unavailable" }
  }

  const usage = report.usage
  const freeRows = toRows(usage, "free")

  return {
    kind: "ready",
    model: usage.model,
    totalTokens: usage.totalTokens,
    maxTokens: usage.maxTokens,
    percentage: usage.percentage,
    untilCompactTokens: freeRows.reduce((total, row) => total + row.tokens, 0),
    rows: [...toRows(usage, "used"), ...freeRows, ...toRows(usage, "buffer")],
    deferredRows: toRows(usage, "deferred"),
    mcpTools: usage.mcpTools,
    memoryFiles: usage.memoryFiles,
    skills: usage.skills,
    takenAt,
  }
}

/**
 * ある種別の分類を、窓に対する割合つきの行にする。**トークンが0の行は落とす**（凡例に
 * 意味の無い行が並ばないように）。**並びは SDK が返した順のまま**。
 */
function toRows(usage: ContextUsage, kind: ContextCategoryKind): readonly ContextUsageRow[] {
  return usage.categories
    .filter((category) => category.kind === kind && category.tokens > 0)
    .map((category) => ({
      name: category.name,
      kind: category.kind,
      tokens: category.tokens,
      share: usage.maxTokens > 0 ? (category.tokens / usage.maxTokens) * 100 : 0,
    }))
}

/**
 * 内訳を取りに行く。**配られない形だったときは「取れない」**（`readContextUsageReport`）。
 * 403 や落ちた応答は例外にせず `response.ok` で分け、取れなかったことは同じ「取れない」に
 * 倒す（画面ですることが同じなので分けない）。
 */
async function fetchContextUsage(): Promise<ContextUsageReport> {
  const response = await fetch(contextUsageUrl())
  if (!response.ok) {
    return UNAVAILABLE_CONTEXT_USAGE
  }
  return readContextUsageReport(await response.json())
}

/**
 * 内訳の URL。**起動トークンを付ける**（`/token-usage` と同じ守り方。
 * `lib/session-token-url.ts` に寄せた）。
 */
function contextUsageUrl(): string {
  return sessionTokenUrl(CONTEXT_USAGE_PATH)
}
