// 画面のファイル（`src/browser/` の下。`*.module.css` と `styles/` を含む）かの判定。
// `report` に撮った画像を載せさせるかどうかの条件に使う。

export const SCREEN_FILE_PREFIX = "src/browser/"

/** リポジトリの根からの相対パスの並びに、画面のファイルが1つでもあるか。 */
export function hasScreenFile(paths: readonly string[]): boolean {
  return paths.some((path) => path.startsWith(SCREEN_FILE_PREFIX))
}
