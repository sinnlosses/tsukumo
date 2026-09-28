// 新しいセッションの既定（モデル・effort・許可モード）。
// セッションを起こすたびに効く値で、帯で変えたその場の値とは別物（帯はセッション限り、ここは次に起こすときの初期値）。
//
// 許可モードの値の一覧そのものは `PERMISSION_MODES` が持ち、ここが持つのは「既定として選べるのはどれか」という別の問いへの答えだけ。
// effort は除外する値が無いので、`EFFORT_LEVELS` をそのまま選べる段の全体として使う。

import type { EffortLevel, ModelAlias, PermissionMode } from "../command.ts"

/**
 * 既定に選べる許可モード。「全部許す」（`bypassPermissions`）は入らない。
 * 全部許すのは起こしたあと帯からその都度選ぶもので、次に起こすたびに黙って全部許す状態から始まる形にはしない。
 */
export type SessionDefaultPermissionMode = Exclude<PermissionMode, "bypassPermissions">

/**
 * 既定に選べる許可モードの全体（`<select>` に出す順もこの並び）。
 * 型のほうが正典で、ここが {@link SessionDefaultPermissionMode} を余さず並べていることはテストが確かめる。
 */
export const SESSION_DEFAULT_PERMISSION_MODES = [
  "default",
  "acceptEdits",
  "auto",
  "plan",
] as const satisfies readonly SessionDefaultPermissionMode[]

/** 新しいセッションを起こすときの既定。3つで1組（1つだけ覚えている状態は作らない）。 */
export type SessionDefault = {
  readonly model: ModelAlias
  readonly effort: EffortLevel
  readonly permissionMode: SessionDefaultPermissionMode
}

/**
 * 同梱の既定。覚えた値が無い・読めない・知らない値のときはここへ畳むので、呼んだ側は「必ず値がある」型で受け取れる。
 * effort の同梱の既定は、駆動が起こすときの既定もこの1つを読む。
 */
export const BUILTIN_SESSION_DEFAULT = {
  model: "opus",
  effort: "medium",
  permissionMode: "auto",
} satisfies SessionDefault

/** 外から届いた文字列が、既定として選べる許可モードかどうか。 */
export function isSessionDefaultPermissionMode(
  value: string,
): value is SessionDefaultPermissionMode {
  return SESSION_DEFAULT_PERMISSION_MODES.some((mode) => mode === value)
}
