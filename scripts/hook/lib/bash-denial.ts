// Bash の呼び出しを止める判定が返す、拒否の記録の名前・規則のキー・モデルへ返す理由。

/** Bash の入口が束ねる判定の、拒否の記録の hook 名。判定を足すときはここにも足す。 */
export const BASH_GUARD_HOOKS = [
  "deny-broad-kill",
  "deny-sed-in-place",
  "deny-background-verify",
  "deny-stdin-wait-cat",
  "deny-foreign-restore",
] as const satisfies readonly string[]

export type BashDenial = {
  readonly hook: string
  readonly rule: string
  readonly refusal: string
}
