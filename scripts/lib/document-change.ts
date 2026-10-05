// 変えたファイルが「文書」（`docs/`・`develop/` 配下の `.md` と、直下の `README.md`・`CLAUDE.md`）
// だけかを判定する、という概念1つを持つ。`src/` 配下の `.md`（同梱パックの `persona.md` など）は
// 文書に入れない。`pnpm run check` が、重い段（typecheck・lint・test:e2e）を省いてよいかに使う。

const DOCUMENT_DIRECTORIES = ["docs/", "develop/"]
const TOP_LEVEL_DOCUMENT_FILES = ["README.md", "CLAUDE.md"]

/** リポジトリ直下からの相対パス `path` が「文書」かどうか。 */
export function isDocumentPath(path: string): boolean {
  if (TOP_LEVEL_DOCUMENT_FILES.includes(path)) {
    return true
  }
  return (
    DOCUMENT_DIRECTORIES.some((directory) => path.startsWith(directory)) && path.endsWith(".md")
  )
}

/** 変えたファイルが1件以上あり、かつ全件が「文書」かどうか。 */
export function isDocumentOnlyChange(paths: readonly string[]): boolean {
  return paths.length > 0 && paths.every(isDocumentPath)
}

const TASK_REGISTRATION_PATHS = ["develop/direction.md"]
const TASK_REGISTRATION_DIRECTORIES = ["develop/draft/", "docs/history/"]

/** 変えたファイルが1件以上あり、かつ全件がタスク登録の置き場（指示メモ・ドラフト・履歴）かどうか。 */
export function isTaskRegistrationOnlyChange(paths: readonly string[]): boolean {
  return (
    paths.length > 0 &&
    paths.every(
      (path) =>
        TASK_REGISTRATION_PATHS.includes(path) ||
        TASK_REGISTRATION_DIRECTORIES.some((directory) => path.startsWith(directory)),
    )
  )
}
