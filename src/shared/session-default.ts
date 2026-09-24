// **新しいセッションの既定**（モデル・effort・許可モード。`docs/requirements.md` 4.1 /
// `docs/screen-design.md` 13.6）。セッションを起こすたびに効く値で、**帯で変えたその場の値とは別物**
// （帯はセッション限り、ここは次に起こすときの初期値）。
//
// 覚えるのはホームの `state.json`（`src/server/adapter/remembered-default.ts`）だが、
// **形と畳み先はサーバとブラウザの両方が読む**ので shared に置く（歯車の操作子が
// `SessionState.sessionDefault` を読み、`set-session-default` で書き換える）。
//
// **許可モードの値の一覧そのものは `command.ts` の `PERMISSION_MODES`**（`docs/design.md` 4.3）。
// ここが持つのは「既定として選べるのはどれか」という別の問いへの答えだけ。**effort は
// 除外する値が無い**ので、`command.ts` の `EFFORT_LEVELS` をそのまま選べる段の全体として使う
// （`SessionDefaultPermissionMode` のような部分集合の型は作らない）。

import { type EffortLevel, type ModelAlias, type PermissionMode } from "./command.ts"

/**
 * 既定に選べる許可モード。**「全部許す」（`bypassPermissions`）は入らない**
 * （`docs/requirements.md` 4.1）——全部許すのは起こしたあと帯からその都度選ぶもので、
 * 次に起こすたびに黙って全部許す状態から始まる形にはしない。
 */
export type SessionDefaultPermissionMode = Exclude<PermissionMode, "bypassPermissions">

/**
 * 既定に選べる許可モードの全体（`<select>` に出す順もこの並び）。**型のほうが正典**で、
 * ここが {@link SessionDefaultPermissionMode} を余さず並べていることは
 * `test/shared/session-default.test.ts` が確かめる。
 */
export const SESSION_DEFAULT_PERMISSION_MODES = [
  "default",
  "acceptEdits",
  "auto",
  "plan",
] as const satisfies readonly SessionDefaultPermissionMode[]

/** 新しいセッションを起こすときの既定。**3つで1組**（1つだけ覚えている状態は作らない）。 */
export type SessionDefault = {
  readonly model: ModelAlias
  readonly effort: EffortLevel
  readonly permissionMode: SessionDefaultPermissionMode
}

/**
 * 同梱の既定。**覚えた値が無い・読めない・知らない値のときはここへ畳む**ので、呼んだ側は
 * 「必ず値がある」型で受け取れる（`docs/requirements.md` 4.1「既定のモデルは Opus」
 * 「既定の許可モードは `auto`」）。**effort の同梱の既定は `medium`**（駆動が起こすときの
 * 既定と同じ値。`src/server/adapter/sdk-driver.ts` が持っていた `DEFAULT_EFFORT` はここへ
 * 一本化した）。
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
