// ビューサーバの待ち受けポートを決める。
// 環境変数から読んだ値が既定か明示かの区別と、既定を使ったときだけ EADDRINUSE で次の番号へずらすリトライを、1つの概念としてここに閉じる。
//
// listen そのもの（node:http）は adapter 側の責務のまま。
// ここは「どのポートで試すか」の決定と、その決定に沿って `start` を呼び直すことだけを持つ。

import type { ResolvedViewPort } from "../../../shared/view-server/view-port.ts"

// 既定ポートから数えて何個先まで試すか（7327〜7346 の20個）。
// 複数の tsukumo を手元で並べて動かす程度を想定した目安で、無限には伸ばさない（どのポートで待っているか分からない状態を作らないため、上限を持って諦める）。
export const VIEW_PORT_FALLBACK_ATTEMPTS = 20

/** `start` が失敗したときの結果。成功時は呼び出し元の型 `T` をそのまま持つ。 */
export type ViewPortStartResult<T> =
  | { readonly kind: "ok"; readonly server: T; readonly port: number }
  | { readonly kind: "failed"; readonly reason: string }

/**
 * 決めたポートで `start` を呼ぶ。
 * 明示指定は一度だけ試してそのまま結果を返す（ずらすと、指定したポートで待てないことに気づけなくなる）。
 * 既定のときだけ、EADDRINUSE が続く限り `VIEW_PORT_FALLBACK_ATTEMPTS` 回まで +1 して試す。
 * EADDRINUSE 以外の失敗（EACCES など）はその場で確定させ、ずらさない。
 *
 * 全滅したときは、試した範囲（最初と最後のポート番号）を含む理由を返す（黙って0番＝空きポート自動割り当てへは逃げない）。
 */
export async function startOnResolvedPort<T>(
  resolution: ResolvedViewPort,
  start: (port: number) => Promise<T>,
): Promise<ViewPortStartResult<T>> {
  if (resolution.kind === "explicit") {
    try {
      return { kind: "ok", server: await start(resolution.port), port: resolution.port }
    } catch (error) {
      return { kind: "failed", reason: describeStartError(error) }
    }
  }

  const firstPort = resolution.port
  const lastPort = firstPort + VIEW_PORT_FALLBACK_ATTEMPTS - 1
  for (let port = firstPort; port <= lastPort; port++) {
    try {
      return { kind: "ok", server: await start(port), port }
    } catch (error) {
      if (!isEaddrInUseError(error)) {
        return { kind: "failed", reason: describeStartError(error) }
      }
      // EADDRINUSE のときだけ次のポートへ。ループの続きへ進む。
    }
  }

  return {
    kind: "failed",
    reason: `${String(firstPort)}〜${String(lastPort)} のポートがすべて塞がっている`,
  }
}

// listen の失敗を種類で分ける。
// Node の listen エラーは Error に `code` が生えた形で届くので、`in` で存在を確かめてから読む。
function isEaddrInUseError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "EADDRINUSE"
}

function describeStartError(error: unknown): string {
  return error instanceof Error ? error.message : "原因不明"
}
