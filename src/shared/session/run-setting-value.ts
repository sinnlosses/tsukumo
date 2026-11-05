// セッションの実行設定（許可モード・モデル・effort）が取る値の語彙。

/** 許可モードの値の全体。SDK の `PermissionMode` と同じ値に揃える（テストが型で守る）。 */
export const PERMISSION_MODES = [
  "default",
  "acceptEdits",
  "auto",
  "plan",
  "bypassPermissions",
] as const

export type PermissionMode = (typeof PERMISSION_MODES)[number]

/**
 * `setModel` に渡すモデルのエイリアス。Claude Code はこの4語を受け付ける（実測）。
 * フルネーム（`claude-opus-4-1` のような値）は渡さない。
 */
export const MODEL_ALIASES = ["opus", "sonnet", "haiku", "fable"] as const

export type ModelAlias = (typeof MODEL_ALIASES)[number]

/** effort の段。SDK の `EffortLevel` と同じ5語（実測）。 */
export const EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"] as const

export type EffortLevel = (typeof EFFORT_LEVELS)[number]

/** 外から届いた文字列が {@link PERMISSION_MODES} のいずれかかどうかを検証する。 */
export function isPermissionMode(value: string): value is PermissionMode {
  return PERMISSION_MODES.some((mode) => mode === value)
}

/** 外から届いた文字列が {@link MODEL_ALIASES} のいずれかかどうかを検証する。 */
export function isModelAlias(value: string): value is ModelAlias {
  return MODEL_ALIASES.some((alias) => alias === value)
}

/** 外から届いた文字列が {@link EFFORT_LEVELS} のいずれかかどうかを検証する。 */
export function isEffortLevel(value: string): value is EffortLevel {
  return EFFORT_LEVELS.some((level) => level === value)
}
