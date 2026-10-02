// Claude Code の許可モード（`PERMISSION_MODES`）を、画面に出す日本語ラベルにする。

import { isPermissionMode, type PermissionMode } from "../../shared/command.ts"
import { BUILTIN_SESSION_DEFAULT } from "../../shared/session/session-default.ts"

/** 許可モードの値と、日本語ラベル。並びは `<select>` に出す順（緩い側が下）。 */
export const PERMISSION_MODE_LABELS = [
  ["default", "毎回聞く"],
  ["acceptEdits", "編集は自動"],
  ["auto", "自動判定"],
  ["plan", "プラン"],
  ["bypassPermissions", "全部許す"],
] satisfies readonly (readonly [PermissionMode, string])[]

/** 届いた `permissionMode` から、画面で扱う許可モードを決める。まだ届いていないときは見た目上の既定へ畳む。 */
export function resolvePermissionMode(mode: string | undefined): PermissionMode {
  return mode !== undefined && isPermissionMode(mode)
    ? mode
    : BUILTIN_SESSION_DEFAULT.permissionMode
}

/** 「全部許す」かどうか。この1つだけは字に意味の色を載せる。 */
export function isDangerousPermissionMode(mode: PermissionMode): boolean {
  return mode === DANGEROUS_PERMISSION_MODE
}

const DANGEROUS_PERMISSION_MODE: PermissionMode = "bypassPermissions"

/** 許可モードの吊り札の行で、盾をどう塗るか。 */
export type PermissionModeShieldFill = "empty" | "dashed" | "filled"

/** 並びは `PERMISSION_MODE_LABELS` と同じ（緩い側が下）。 */
export const PERMISSION_MODE_SHIELD_FILLS = [
  ["default", "empty"],
  ["acceptEdits", "dashed"],
  ["auto", "dashed"],
  ["plan", "dashed"],
  ["bypassPermissions", "filled"],
] satisfies readonly (readonly [PermissionMode, PermissionModeShieldFill])[]

/** 無ければ `"empty"` を返す。 */
export function permissionModeShieldFill(mode: PermissionMode): PermissionModeShieldFill {
  return PERMISSION_MODE_SHIELD_FILLS.find(([candidate]) => candidate === mode)?.[1] ?? "empty"
}

/** 「全部許す」の行だけに添える一言の注意。 */
export const BYPASS_PERMISSIONS_NOTICE = "確認なしで全部のコマンドを実行する"
