// 押し出し（フレーム）の購読の手続き（`docs/glossary.md`「手続き」「フレーム」）。形は
// `src/shared/contract/frame.ts`、束ねるのは配線の `src/router.ts`。
//
// **購読の元はコールバックのまま**（接続の context の `subscribe`。中身は `session-manager` の
// `subscribe` に `view-delivery.ts` の `refresh` を相乗りさせたもの）で、ここはそれを Event Iterator
// へ写すだけ。`hello` を先に送る順序を決めているのは `session-manager` 側で、ここは届いた順に流す。

import { implement } from "@orpc/server"

import { frameContract } from "../../../shared/contract/frame.ts"
import { type ServerFrame } from "../../../shared/frame.ts"

/**
 * 接続を購読に加える口。**呼んだ瞬間に `hello` を同期で1つ `send` へ渡し**、以後のフレームを配る。
 * 外すための関数を返す（`session-manager` の `subscribe` と同じ約束）。
 */
export type SubscribeFrames = (send: (frame: ServerFrame) => void) => () => void

export function frameProcedure() {
  const procedure = implement(frameContract).$context<{ readonly subscribe: SubscribeFrames }>()
  return procedure.router({
    subscribe: procedure.subscribe.handler(({ context, signal }) =>
      framesOf(context.subscribe, signal),
    ),
  })
}

/**
 * コールバックの購読を async generator へ写す。
 *
 * - **取りこぼさず、捨てない**: 読み手が次を取りに来るまでのフレームは全部溜める（oRPC の
 *   `EventPublisher` は既定で100件を超えると古いものから捨て、畳み込みが食い違う）
 * - **手続きの `signal` で購読を外す**: 接続が切れると oRPC は `signal` を中断するだけで、次の
 *   フレームが届くまで generator の `finally` は走らない。フレームを待っている間も中断で起こす
 */
async function* framesOf(
  subscribe: SubscribeFrames,
  signal: AbortSignal | undefined,
): AsyncGenerator<ServerFrame> {
  const buffered: ServerFrame[] = []
  // 次のフレーム（か中断）を待っている読み手を起こす口。待っていない間は空。
  let wake: (() => void) | undefined = undefined
  const unsubscribe = subscribe((frame) => {
    buffered.push(frame)
    wake?.()
  })
  const onAbort = (): void => {
    wake?.()
  }
  signal?.addEventListener("abort", onAbort)
  try {
    for (;;) {
      if (signal?.aborted === true) {
        return
      }
      const next = buffered.shift()
      if (next !== undefined) {
        yield next
        continue
      }
      await new Promise<void>((resolve) => {
        wake = resolve
      })
      wake = undefined
    }
  } finally {
    signal?.removeEventListener("abort", onAbort)
    unsubscribe()
  }
}
