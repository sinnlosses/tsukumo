// 紙のキーの一覧（`?` で開く表）の行。キーを足すときはここへ行を足す。

export type PaperKeyRow = {
  readonly keys: readonly string[]
  readonly action: string
}

export const PAPER_KEYS = [
  { keys: ["{", "}"], action: "前の見出し・次の見出しへ移る" },
  { keys: ["[", "]"], action: "前のやり取り・次のやり取りへ移る" },
  { keys: ["1", "…", "9"], action: "問いに答える" },
  { keys: ["d"], action: "読む深さを一目 → 本文 → 記録の順に替える" },
  { keys: ["o"], action: "節を畳む・開く" },
  { keys: ["?"], action: "キーの一覧を出す" },
] as const satisfies readonly PaperKeyRow[]
