// git 管理下のファイルの一覧。件数の上限で切ったときは、落とした件数を一緒に運ぶ。
// ここはファイルI/Oを持たない。

/**
 * レポートから頼まれるパス（開く・抜き書きを読む）の長さの上限。
 * 形の検査ではなく素朴な上限で、通してよいかは git 管理下の一覧にあるかどうかで決まる。
 */
export const MAX_REPOSITORY_PATH_LENGTH = 1_000

/**
 * パスの並び（`cwd` からの相対）と、上限で落とした件数。
 * 落とさなかったときの `omittedCount` は 0 で、一覧が全件であることを表す。
 */
export type RepositoryFileList = {
  readonly paths: readonly string[]
  readonly omittedCount: number
}

/** 一覧を作れなかったときの値（git リポジトリでない・`git` が無いなど）。全件が空であって、切ったわけではない。 */
export const EMPTY_REPOSITORY_FILE_LIST = {
  paths: [],
  omittedCount: 0,
} as const satisfies RepositoryFileList
