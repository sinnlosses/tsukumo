// 作業ディレクトリの git から変更の量を数えるための口の型。

/** HEAD を読んだ結果。 */
export type GitHead =
  | { readonly kind: "known"; readonly sha: string }
  | { readonly kind: "unknown" }

/** 控えた HEAD からの `git diff --numstat` の出力。祖先でないときも打てないときも `unavailable`。 */
export type NumstatOutput =
  | { readonly kind: "output"; readonly text: string }
  | { readonly kind: "unavailable" }

/** 作業ディレクトリの git に触る口。どちらも例外を投げない。 */
export type ChangeCountGit = {
  readonly readHead: () => Promise<GitHead>
  readonly diffNumstatSince: (head: string) => Promise<NumstatOutput>
}

/** 何も数えない口（疑似セッション用）。 */
export const IDLE_CHANGE_COUNT_GIT: ChangeCountGit = {
  readHead: () => Promise.resolve({ kind: "unknown" }),
  diffNumstatSince: () => Promise.resolve({ kind: "unavailable" }),
}
