// 標準出力がパイプのとき、居座る道具が出す警告。
// `process.stdout.isTTY` はパイプでもファイルでも undefined なので、パイプかどうかは fstat の結果で決める。

/** 標準出力の行き先の種類（`fs.Stats` のうち判定に使うもの）。 */
export type StdoutKind = {
  readonly isFIFO: () => boolean
}

/**
 * パイプの先（`| tail` など）は入力の終わりを待つので、居座る道具は戻らない。
 * パイプのときだけ警告を返し、ファイル・端末のときは undefined。
 */
export function stdoutPipeWarning(kind: StdoutKind): string | undefined {
  if (!kind.isFIFO()) {
    return undefined
  }
  return "警告: 標準出力がパイプで、この道具は居座るので、パイプの先は戻らない。パイプに繋がず `> ログ 2>&1 &` で背景に回す\n"
}
