// コマンドを表の行へ渡すところ（`docs/design.md` 2章「コマンドの受け手と手続きの置き方」）。
// **断る条件を見るのはここ1箇所**で、順は「雑談の外か」→「ターン中か」。通ったら行の種類ごとに
// 受け手を呼ぶ。どの種類をどの機能が受けるかは、配線の `src/command-route.ts` が束ねた表が持つ。
//
// 画面も同じ条件で操作子を塞ぐが、ここでも見る（画面を経ない依頼・無効化の描画が間に合わなかった
// ときの取りこぼし対策）。

import { type ClientCommand } from "../../../shared/command.ts"
import { type SessionEvent } from "../../../shared/session-event.ts"
import { type SessionState } from "../../../shared/session-state.ts"
import {
  type CommandByType,
  type CommandGuard,
  type CommandType,
  type FeatureReceiver,
} from "../../core/command-receiver.ts"
import { type SessionDriver } from "../../session-driver/core/session-driver.ts"
import { type SessionLaunchRequest } from "./session-launch.ts"

/** コマンドを受け付けられたか。理由は定型文（`FRAME_ERROR_REASON`）だけを返す。 */
export type DispatchResult = { readonly ok: true } | { readonly ok: false; readonly reason: string }

/**
 * いまの代に固定した口。**長く続く受け手が、起こし直しをまたいで新しい代に混ざらない**ために
 * 始めたときに1回取って持ち回る（`emit` は代が閉じたら黙って捨てる）。
 */
export type CommandGeneration = {
  readonly emit: (event: SessionEvent) => void
  /** 振り返りの書き手を中断する信号（代を閉じると中断される）。 */
  readonly diarySignal: AbortSignal
}

/**
 * 受け手が使うセッションの口。**この4つだけ**で、代・束・購読者は見せない。
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
 * セッションの口を受け取る行。**型がここにあるので、`session` の表にだけ書ける**。
 */
export type SessionReceiver<C> = CommandGuard & {
  readonly kind: "session"
  readonly receive: (command: C, session: CommandSession) => Promise<DispatchResult>
}

/** 行の3種。 */
export type CommandReceiver<C> = FeatureReceiver<C> | SessionReceiver<C>

/** 全種類を網羅した表。 */
export type CommandRoute = { readonly [T in CommandType]: CommandReceiver<CommandByType[T]> }

/**
 * コマンド1件を、表の行へ渡す。**受け手が投げても常駐プロセスは落とさず**、行の定型文の理由を
 * 返す（`session` の行は自分で畳む）。
 */
export function dispatchCommand(
  route: CommandRoute,
  command: ClientCommand,
  session: CommandSession,
): Promise<DispatchResult> {
  return dispatchTo(route, command.type, command, session)
}

/**
 * 種類を型引数にしたまま行とコマンドを対で扱う（種類ごとの合併を開くと、行の引数が全種類の
 * 交わりになって呼べない）。
 */
async function dispatchTo<T extends CommandType>(
  route: CommandRoute,
  type: T,
  command: CommandByType[T],
  session: CommandSession,
): Promise<DispatchResult> {
  const receiver: CommandReceiver<CommandByType[T]> = route[type]
  const refusal = refusalOf(receiver, session.state())
  if (refusal !== undefined) {
    return { ok: false, reason: refusal }
  }
  switch (receiver.kind) {
    case "session":
      return receiver.receive(command, session)
    case "write":
      try {
        const event = await receiver.receive(command)
        if (event === undefined) {
          return { ok: false, reason: receiver.failure }
        }
        // 書き込みで起こしたイベントは、駆動から届くのと同じ「新しい」もの（復元の再生ではない）。
        session.generation().emit(event)
        return { ok: true }
      } catch {
        return { ok: false, reason: receiver.failure }
      }
    case "call":
      try {
        return (await receiver.receive(command))
          ? { ok: true }
          : { ok: false, reason: receiver.failure }
      } catch {
        return { ok: false, reason: receiver.failure }
      }
  }
}

/** 断る理由（断らないなら undefined）。**見る順は「雑談の外か」→「ターン中か」**。 */
function refusalOf(guard: CommandGuard, state: SessionState): string | undefined {
  if (!state.chatMode && guard.chatOnly !== false) {
    return guard.chatOnly
  }
  if (state.turn.kind === "running" && guard.idleTurn !== false) {
    return guard.idleTurn
  }
  return undefined
}
