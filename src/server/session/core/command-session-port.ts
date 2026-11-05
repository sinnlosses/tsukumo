// コマンドの受け手に見せるセッションの口（`CommandSession`）と、起こし直しの指定（`SessionLaunchRequest`）の型。
// 型だけで、`session/core` の他のファイルは読まない。

import type { SessionEvent } from "../../../shared/session/session-event.ts"
import type { SessionId } from "../../../shared/session/session-id.ts"
import type { SessionState } from "../../../shared/session/session-state.ts"
import type { CharacterSelection } from "../../character-pack/core/character-selection.ts"
import type { DispatchResult } from "../../core/command-receiver.ts"
import type { SessionDriver } from "../../session-driver/core/session-driver.ts"

/**
 * いまの代に固定した口。
 * 長く続く受け手は、起こし直しをまたいで新しい代に混ざらないために、始めたときに1回取って持ち回る（`emit` は代が閉じたら黙って捨てる）。
 */
export type CommandGeneration = {
  readonly emit: (event: SessionEvent) => void
  /** 振り返りの書き手を中断する信号（代を閉じると中断される）。 */
  readonly diarySignal: AbortSignal
}

/** モードの直前のセッション。覚えていないときは `none`。 */
export type RememberedSession =
  | { readonly kind: "none" }
  | { readonly kind: "remembered"; readonly sessionId: SessionId }

/** 受け手が使うセッションの口。この5つだけで、代・束・購読者は見せない。 */
export type CommandSession = {
  /** いまの姿。 */
  readonly state: () => SessionState
  /**
   * 指したモードの直前のセッション。モードを切り替えて起こし直す直前に、そのとき出していたセッションを覚える。
   * 起こし直しでは残り、プロセスを越えては覚えない。ブラウザへは配らない。
   */
  readonly modeSession: (chat: boolean) => RememberedSession
  /** いまの代の駆動が起き上がるのを待つ。 */
  readonly driver: () => Promise<SessionDriver>
  /** 起こし直す（失敗しても投げず、定型文の理由を返す）。 */
  readonly restart: (request: SessionLaunchRequest) => Promise<DispatchResult>
  /** いまの代に固定した口。 */
  readonly generation: () => CommandGeneration
}

/**
 * 起こす（起こし直す）ときの指定。
 * パックの決め方（{@link CharacterSelection}）が、そのまま「覚えるかどうか」も分ける。覚えるのは `name` のときだけ。
 */
export type SessionLaunchRequest = {
  /** これから起こすパックの決め方。 */
  readonly selection: CharacterSelection
  /** 雑談モードで起こすか。 */
  readonly chat: boolean
  /** これから起こすセッションの決め方。 */
  readonly resume: SessionResume
}

/** これから起こすセッションの決め方。 */
export type SessionResume =
  /**
   * 画面から選ばれたセッション。探さずに、一覧に出したIDをそのまま続きにする。
   * claude 側が知らないIDだったときは新規のセッションとして起き上がる。
   */
  | { readonly by: "id"; readonly sessionId: SessionId }
  /** 探さずに新規で起こす。 */
  | { readonly by: "new" }
