// 作業ディレクトリの git から変更の量を数えるための口の型。

/** HEAD を読んだ結果。 */
export type GitHead =
  | { readonly kind: "known"; readonly sha: string }
  | { readonly kind: "unknown" }

/** 控えた HEAD からの `git diff --numstat` の出力。祖先でないときも打てないときも `unavailable`。 */
export type NumstatOutput =
  | { readonly kind: "output"; readonly text: string }
  | { readonly kind: "unavailable" }

export type CommitSubject = {
  readonly sha: string
  readonly subject: string
}

/** 控えた HEAD より後のコミットの一覧（新しい順）。祖先でないときも打てないときも `unavailable`。 */
export type CommitListOutput =
  | { readonly kind: "output"; readonly commits: readonly CommitSubject[] }
  | { readonly kind: "unavailable" }

/** `git diff --name-status` の出力。`NumstatOutput` と同じく、取れないときは `unavailable`。 */
export type NameStatusOutput = NumstatOutput

/** 作業ディレクトリの git に触る口。どれも例外を投げない。 */
export type ChangeCountGit = {
  readonly readHead: () => Promise<GitHead>
  readonly diffNumstatSince: (head: string) => Promise<NumstatOutput>
  readonly commitsSince: (head: string) => Promise<CommitListOutput>
  /** コミット1件が入れた変更の `git show --numstat`。 */
  readonly numstatOfCommit: (sha: string) => Promise<NumstatOutput>
  /** 控えた HEAD からの `git diff --name-status --no-renames`。 */
  readonly nameStatusSince: (head: string) => Promise<NameStatusOutput>
  /** コミット1件が入れた変更の `git show --name-status --no-renames`。 */
  readonly nameStatusOfCommit: (sha: string) => Promise<NameStatusOutput>
}

/** 何も数えない口（疑似セッション用）。 */
export const IDLE_CHANGE_COUNT_GIT: ChangeCountGit = {
  readHead: () => Promise.resolve({ kind: "unknown" }),
  diffNumstatSince: () => Promise.resolve({ kind: "unavailable" }),
  commitsSince: () => Promise.resolve({ kind: "unavailable" }),
  numstatOfCommit: () => Promise.resolve({ kind: "unavailable" }),
  nameStatusSince: () => Promise.resolve({ kind: "unavailable" }),
  nameStatusOfCommit: () => Promise.resolve({ kind: "unavailable" }),
}
