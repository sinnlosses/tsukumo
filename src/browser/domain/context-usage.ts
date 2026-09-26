// いまのコンテキストの内訳（`docs/glossary.md`「コンテキストの内訳」）を取りに行き、
// 見た目（`components/page/token-usage/components/context-usage-card/context-usage-card.tsx` / `components/domain/sidebar/context-usage-row.tsx`）が
// 算出せずにそのまま描ける形へ畳む。**2つの機能が読むので `browser/domain/`**（トークン消費の
// 画面の札に加えて、サイドバーのセッション情報の行がこの内訳を読むようになったため。
// docs/design.md 2章「上げる引き金は「2つ目の読み手が出たとき」」）。
//
// **`browser/domain/` は `stores/` を import できない**（docs/design.md 2章の箱の表）ので、
// 「いつ取り直すか」を自分では決めない。**`refetchKey` を呼び出し側から受け取り、値が変われば
// 取り直す**（`useQuery` の `queryKey` に含めるだけで、`useEffect` は要らない）。「ターンが終わる
// たびに取り直す」ための実際の値（`state.lastTurnFinishedAt` から作る）は
// {@link contextUsageRefetchKey} が純関数として持ち、`state.lastTurnFinishedAt` を読む
// `useSessionSelector` は `stores/` を読める機能の側（`token-usage.tsx` /
// `context-usage-row.tsx`）が呼ぶ。**`state.turn` ではなく `state.lastTurnFinishedAt` を読む**
// ——`turn` は `running` に移ると終わった時刻を失う（`shared/session-state.ts` の
// `TurnProgress`）ので、`turn` から作ると新しいターンが始まった瞬間に合図が `0` へ戻り、
// ターンの途中で骨組み・古い値へ
// 巻き戻ってしまう（実測。「取り直すのはターンが終わるたび。ターンの途中は前の値のまま」に
// 反する）。`lastTurnFinishedAt` は `running` の間も直前の値を持ち続ける
// （`shared/session-state.ts`）ので、ここは受け取った値をそのまま使うだけでよい。**同じ
// `state` からは同じ `refetchKey` が出る**ので、2つの機能が同時にマウントされていても
// （`app.tsx` の `<Activity>` は会話の画面を隠すだけで外さない）`useQuery` の cache 1本に
// 相乗りし、取り直しは1回で済む。
//
// **「取れなかった」は理由を問わず1つに畳む**（応答が落ちた・読めない形は区別しない。
// 画面ですることが同じなので `use-token-usage.ts` と同じ畳み方）。**「まだ届いていない」は
// 別の種類にする**（骨組みを出すか一言を出すかで見た目が変わるため。`query.isPending` から
// 導くので `useEffect` は要らない）。

import { useQuery } from "@tanstack/react-query"
import { sumBy } from "remeda"

import {
  type ContextCategoryKind,
  type ContextUsage,
  type ContextUsageItem,
  type ContextUsageReport,
  UNAVAILABLE_CONTEXT_USAGE,
} from "../../shared/context-usage.ts"
import { rpc } from "../lib/rpc-client.ts"

/** 横棒の一区間と、凡例の1行（**同じ並びを両方が使う**ので、色と名前が必ず対になる）。 */
export type ContextUsageRow = {
  /** SDK が返した分類の名前（日本語への置き換えと色は
   * `../components/page/token-usage/components/context-usage-card/domain/context-usage-category.ts`）。 */
  readonly name: string
  readonly kind: ContextCategoryKind
  readonly tokens: number
  /** 窓の大きさに対する割合（%）。横棒の幅になる。 */
  readonly share: number
}

/**
 * 内訳1つぶんを描くために要るもの。**判別可能な合併型**で、取れないときは実物を出さない
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

/**
 * `state.lastTurnFinishedAt` から、内訳を取り直す合図を作る。**ターンが終わるたびに違う値**
 * になり、ターンが `running` へ移っても（`lastTurnFinishedAt` 自体が戻らないので）そのまま。
 * 「無い」はここで畳む——まだ一度もターンが終わっていなければ `0`（エポックミリ秒として
 * 現実には起きない値なので、番兵として使える）。
 */
export function contextUsageRefetchKey(lastTurnFinishedAt: number | undefined): number {
  return lastTurnFinishedAt ?? 0
}

/**
 * `refetchKey` が変わるたびに取り直す。**マウント時にも1回引く**（`staleTime: 0` なので
 * 初回もキャッシュを信用しない）。「ターンの実行中に呼んでも待たされない」（実測は
 * `src/server/session-driver/adapter/sdk-context-usage.ts` の `CONTEXT_USAGE_DETAIL`）ので、進行中でも
 * 同じように取りに行く。
 */
export function useContextUsage(refetchKey: number): UseContextUsageResult {
  const query = useQuery(
    rpc.contextUsage.report.queryOptions({
      // 合図を鍵に足す（値が変われば別のクエリとして引き直す）。
      queryKey: contextUsageQueryKey(refetchKey),
      staleTime: 0,
      // 落ちた応答は再試行せず、すぐ「取れない」に倒す（骨組みのまま待たせない。手続きにする前と同じ）。
      retry: false,
    }),
  )
  // 初回の応答がまだ無い間は骨組み（`query.isPending` から導くだけで `useEffect` は要らない）。
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
 * 届いた内訳を描く形へ畳む。**横棒と凡例が同じ並びを見る**ように、中身・空き・自動圧縮
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
