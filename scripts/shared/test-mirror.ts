// 対象のファイルと、その鏡になる単体テストの置き場所の対応。

/** 対象のパス（`src/…`・`scripts/…`・`plugin/…`）から、その鏡の場所のテストのリポジトリ相対パスを返す。 */
export function mirrorTestPath(targetPath: string): string {
  const slash = targetPath.indexOf("/")
  const root = targetPath.slice(0, slash)
  const rest = targetPath.slice(slash + 1)
  return `test/${root === "src" ? "" : `${root}/`}${rest.replace(/(\.tsx?)$/, ".test$1")}`
}
