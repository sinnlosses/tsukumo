// レポートに書かれたパスを外の世界（外部コマンド・ファイルの読み）へ渡す前の門番。
// 通すのは git 管理下の一覧にあるパスだけ（任意の文字列を渡さない）。

/**
 * `path` が `listFiles` の返す一覧にあるか。
 * 一覧は確かめるたびに取り直す（起動後に足したファイルも通す）。
 */
export async function isTrackedPath(
  path: string,
  listFiles: () => Promise<readonly string[]>,
): Promise<boolean> {
  const files = await listFiles()
  return files.includes(path)
}
