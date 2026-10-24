// 「ファイル（コマンド）が無い」を表す例外か。ENOENT を見る判定をここに1つだけ持つ。

export function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && Reflect.get(error, "code") === "ENOENT"
}
