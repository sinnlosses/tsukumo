// いまのコンテキストの内訳を取りに行き、見た目が算出せずにそのまま描ける形へ畳む。
//
// ここは `stores/` を import できないので、「いつ取り直すか」を自分では決めない。
// `refetchKey` を呼び出し側から受け取り、値が変われば取り直す（`useQuery` の `queryKey` に含めるだけ）。
// 「ターンが終わるたびに取り直す」ための実際の値は `state.finishedTurnCount` で、呼び出し側がそのまま渡す。
// 同じ `state` からは同じ `refetchKey` が出るので、2つの画面が同時にマウントされていても `useQuery` の cache 1本に相乗りし、取り直しは1回で済む。
//
// 「取れなかった」は理由を問わず1つに畳む（画面ですることが同じなので）。
// 「まだ届いていない」は、骨組みを出すか一言を出すかで見た目が変わるので別の種類にする。

import { useQuery } from "@tanstack/react-query"
import { sumBy } from "remeda"

import {
  type ContextCategoryKind,
  type ContextUsage,
  type ContextUsageItem,
  type ContextUsageReport,
  UNAVAILABLE_CONTEXT_USAGE,
} from "../../shared/context-usage/context-usage.ts"
import { rpc } from "./rpc.ts"

/** 横棒の一区間と、凡例の1行（同じ並びを両方が使うので、色と名前が必ず対になる）。 */
export type ContextUsageRow = {
  /** SDK が返した分類の名前（日本語への置き換えと色は描く側が持つ）。 */
  readonly name: string
  readonly kind: ContextCategoryKind
  readonly tokens: number
  /** 窓の大きさに対する割合（%）。横棒の幅になる。 */
  readonly share: number
}

/**
 * 内訳1つぶんを描くために要るもの。判別可能な合併型で、取れないときは実物を出さない。
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

/**
 * `refetchKey` が変わるたびに取り直す。前の鍵の値は持ち越さない（取り直しの間は `pending`）。マウント時にも1回引く（`staleTime: 0`）。
 * 内訳はターンの実行中に呼んでも待たされない（実測は `CONTEXT_USAGE_DETAIL`）ので、進行中でも同じように取りに行く。
 */
export function useContextUsage(refetchKey: number): UseContextUsageResult {
  const query = useQuery(
    rpc.contextUsage.report.queryOptions({
      // 合図を鍵に足す（値が変われば別のクエリとして引き直す）。
      queryKey: contextUsageQueryKey(refetchKey),
      staleTime: 0,
      // 落ちた応答は再試行せず、すぐ「取れない」に倒す（骨組みのまま待たせない）。
      retry: false,
    }),
  )
  // 初回の応答がまだ無い間は骨組み。
  if (query.isPending) {
    return { kind: "pending" }
  }
  // 取れなかった回（403・落ちた応答・配られない形）は理由を問わず「取れない」に畳む。
  return toCard(query.data ?? UNAVAILABLE_CONTEXT_USAGE, query.dataUpdatedAt)
}

/** 内訳のクエリの鍵（手続きの鍵に、取り直しの合図を足したもの）。 */
function contextUsageQueryKey(refetchKey: number): readonly unknown[] {
  return [...rpc.contextUsage.report.queryKey(), refetchKey]
}

/**
 * 届いた内訳を描く形へ畳む。
 * 横棒と凡例が同じ並びを見るように、中身・空き・自動圧縮バッファをこの順で1本の並びにする（`deferred` は窓の外なので別の並び）。
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
    untilCompactTokens: sumBy(freeRows, (row) => row.tokens),
    rows: [...toRows(usage, "used"), ...freeRows, ...toRows(usage, "buffer")],
    deferredRows: toRows(usage, "deferred"),
    mcpTools: usage.mcpTools,
    memoryFiles: usage.memoryFiles,
    skills: usage.skills,
    takenAt,
  }
}

/**
 * ある種別の分類を、窓に対する割合つきの行にする。
 * トークンが0の行は落とす（凡例に意味の無い行が並ばないように）。並びは SDK が返した順のまま。
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
