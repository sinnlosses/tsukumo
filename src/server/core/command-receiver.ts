// コマンドの受け手の行の型と、葉の機能の行を呼ぶところ（`docs/design.md` 2章「コマンドの受け手と
// 手続きの置き方」）。機能ごとの表（`<機能>/core/<機能>-command.ts`）が書く行の形と、手続き
// （`<機能>/adapter/<機能>-procedure.ts`）が行を呼ぶ {@link receiveFeatureCommand} を持つ。
//
// 行の種類のうち `session`（セッションの口を受け取るもの）はここに無い——型が
// `session/core/command-session.ts` にあるので、葉の機能の表からは書けない。断る条件は行ではなく
// 契約の `meta`（`src/shared/command.ts`）にあり、見るのは `rpc-guard.ts`。

import {
  type CommandContract,
  type CommandInputs,
  type CommandRefusalReason,
} from "../../shared/command.ts"
import { type SessionEvent } from "../../shared/session-event.ts"

/** コマンドを受け付けられたか。理由は定型文（`FRAME_ERROR_REASON`）だけを返す。 */
export type DispatchResult = { readonly ok: true } | { readonly ok: false; readonly reason: string }

/**
 * 書き込み口を呼び、返ったイベントを流す行。`undefined` が返ったとき・投げたときは `failure` で断る。
 * イベントを流すのは {@link receiveFeatureCommand} で、行は流し方を知らない。
 */
export type WriteReceiver<C> = {
  readonly kind: "write"
  readonly receive: (input: C) => SessionEvent | undefined | Promise<SessionEvent | undefined>
  readonly failure: CommandRefusalReason
}

/** 外へ頼むだけの行（イベントを流さない）。`false` が返ったとき・投げたときは `failure` で断る。 */
export type CallReceiver<C> = {
  readonly kind: "call"
  readonly receive: (input: C) => Promise<boolean>
  readonly failure: CommandRefusalReason
}

/** 葉の機能が書ける行（`write` か `call`）。 */
export type FeatureReceiver<C> = WriteReceiver<C> | CallReceiver<C>

/** 機能の表。その機能の契約の手続きごとに1行。 */
export type FeatureCommandTable<T extends CommandContract> = {
  readonly [K in keyof T]: FeatureReceiver<CommandInputs<T>[K]>
}

/**
 * 葉の機能の手続きが受ける口（手続きの context の `session`）。セッションの口
 * （`CommandSession`）のうちイベントを流す1つだけを型にしてあるので、葉の機能は `session` の
 * 型を読まずに済む（機能どうしの辺を増やさない）。
 */
export type CommandEventSink = {
  /** いまの代に固定した口（呼んだ時点の代の `emit`）。 */
  readonly generation: () => { readonly emit: (event: SessionEvent) => void }
}

/**
 * 葉の機能の行を1件呼ぶ。受け手が投げても常駐プロセスは落とさず、行の定型文の理由を返す。
 * `write` の行が返したイベントは、返った時点の代へ流す。
 */
export async function receiveFeatureCommand<C>(
  receiver: FeatureReceiver<C>,
  input: C,
  sink: CommandEventSink,
): Promise<DispatchResult> {
  switch (receiver.kind) {
    case "write":
      try {
        const event = await receiver.receive(input)
        if (event === undefined) {
          return { ok: false, reason: receiver.failure }
        }
        // 書き込みで起こしたイベントは、駆動から届くのと同じ「新しい」もの（復元の再生ではない）。
        sink.generation().emit(event)
        return { ok: true }
      } catch {
        return { ok: false, reason: receiver.failure }
      }
    case "call":
      try {
        return (await receiver.receive(input))
          ? { ok: true }
          : { ok: false, reason: receiver.failure }
      } catch {
        return { ok: false, reason: receiver.failure }
      }
  }
}
