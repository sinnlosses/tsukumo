// Claude Code の許可モード（`src/shared/command.ts` の `PERMISSION_MODES`）を、画面に出す
// 日本語ラベルにする。置き場の理由は `model-label.ts` の冒頭と同じ（読むのは帯だけ、
// フックを呼ばない部品が読む対応表、表示の整形は契約ではない）。

import { isPermissionMode, type PermissionMode } from "../../../../../shared/command.ts"
import { BUILTIN_SESSION_DEFAULT } from "../../../../../shared/session-default.ts"

/**
 * 許可モードの値と、日本語ラベル。**並びは `<select>` に出す順**（緩い側が下）。
 */
export const PERMISSION_MODE_LABELS = [
  ["default", "毎回聞く"],
  ["acceptEdits", "編集は自動"],
  ["auto", "自動判定"],
  ["plan", "プラン"],
  ["bypassPermissions", "全部許す"],
] satisfies readonly (readonly [PermissionMode, string])[]

/**
 * 届いた `permissionMode` から、画面で扱う許可モードを決める。**まだ届いていないときは
 * 見た目上の既定へ畳む**ので、呼んだ側は「必ず値がある」型で受け取れる。
 */
export function resolvePermissionMode(mode: string | undefined): PermissionMode {
  return mode !== undefined && isPermissionMode(mode)
    ? mode
    : BUILTIN_SESSION_DEFAULT.permissionMode
}

/**
 * 「全部許す」（`bypassPermissions`）かどうか。**この1つだけは字に意味の色を載せる**
 * （`docs/screen-design.md` 13.1 原則5。ラベルの文字が必ず付くので、色だけで伝えることにならない）。
 */
export function isDangerousPermissionMode(mode: PermissionMode): boolean {
  return mode === DANGEROUS_PERMISSION_MODE
}

const DANGEROUS_PERMISSION_MODE: PermissionMode = "bypassPermissions"
