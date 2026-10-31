// `PreToolUse` で、ツールの呼び出しを通す・拒む・入力を差し替えて通すの判定の結果。
// Claude Code のフックの出力の形はこの型の外（adapter）で組む。

export type ToolVerdict =
  | { readonly kind: "allow" }
  | { readonly kind: "deny"; readonly reason: string }
  | { readonly kind: "rewrite"; readonly input: Readonly<Record<string, unknown>> }
