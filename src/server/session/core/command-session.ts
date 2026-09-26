// コマンドの受け手に見せるセッションの口（`docs/design.md` 2章「コマンドの受け手と手続きの置き方」）。
// `session-manager.ts` が作り、`/ws` の手続きの context に載って `session` の行
// （`session-command.ts`）へ渡る。断る条件は契約の `meta` にあり、見るのは `rpc-guard.ts`で、
// ここは口の形と `session` の行の型、行を呼ぶ {@link receiveSessionCommand} だけを持つ。

import { type SessionEvent } from "../../../shared/session-event.ts"
import { type SessionState } from "../../../shared/session-state.ts"
import {
  type DispatchResult,
  type FeatureReceiver,
  receiveFeatureCommand,
} from "../../core/command-receiver.ts"
import { type SessionDriver } from "../../session-driver/core/session-driver.ts"
import { type SessionLaunchRequest } from "./session-launch.ts"

/**
 * いまの代に固定した口。長く続く受け手が、起こし直しをまたいで新しい代に混ざらないために
 * 始めたときに1回取って持ち回る（`emit` は代が閉じたら黙って捨てる）。
 */
export type CommandGeneration = {
  readonly emit: (event: SessionEvent) => void
  /** 振り返りの書き手を中断する信号（代を閉じると中断される）。 */
  readonly diarySignal: AbortSignal
}

/**
 * 受け手が使うセッションの口。この4つだけで、代・束・購読者は見せない。葉の機能の手続きは
 * このうち `generation` の `emit` だけを型にした `CommandEventSink`（`core/command-receiver.ts`）で
 * 同じものを受ける。
 */
export type CommandSession = {
  /** いまの姿。 */
  readonly state: () => SessionState
  /** いまの代の駆動が起き上がるのを待つ。 */
  readonly driver: () => Promise<SessionDriver>
  /** 起こし直す（失敗しても投げず、定型文の理由を返す）。 */
  readonly restart: (request: SessionLaunchRequest) => Promise<DispatchResult>
  /** いまの代に固定した口。 */
  readonly generation: () => CommandGeneration
}

/**
 * セッションの口を受け取る行。型がここにあるので、`session` の表にだけ書ける。受け手が
 * 投げても常駐プロセスは落とさず、自分で定型文の理由に畳む。
 */
export type SessionReceiver<C> = {
  readonly kind: "session"
  readonly receive: (input: C, session: CommandSession) => Promise<DispatchResult>
}

/** `session` の表の行（3種。葉の機能と同じ `write` / `call` も書ける）。 */
export type CommandReceiver<C> = FeatureReceiver<C> | SessionReceiver<C>

/** `session` の表の行を1件呼ぶ（行の種類で呼び方を分けるだけ）。 */
export function receiveSessionCommand<C>(
  receiver: CommandReceiver<C>,
  input: C,
  session: CommandSession,
): Promise<DispatchResult> {
  return receiver.kind === "session"
    ? receiver.receive(input, session)
    : receiveFeatureCommand(receiver, input, session)
}
