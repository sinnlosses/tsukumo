// 丸ごと置き換える形の JSON ファイルの読み書き。
// 境界（どこに・何のために書くか）は名乗らず、JSON ファイルの扱い方だけを知っている。
//
// 検証はしない。読んだ値の形が正しいかは呼び出し元の zod スキーマに委ねる（`unknown` のまま返す）。
// 書けなくても・読めなくても例外を投げない。

import { mkdirSync } from "node:fs"
import { dirname } from "node:path"

import { writeFileAtomic } from "./atomic-file.ts"
import { readOptionalFile } from "./optional-file.ts"

/** JSON として読む。ファイルが無い・壊れているときは undefined。 */
export function readJsonFile(path: string): unknown {
  const content = readOptionalFile(path)
  if (content === undefined) {
    return undefined
  }

  try {
    return JSON.parse(content)
  } catch {
    return undefined
  }
}

/** JSON として丸ごと書く。ディレクトリが無ければ作る。失敗したその回は諦めて次へ進む。 */
export function writeJsonFile(path: string, value: unknown): void {
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileAtomic(path, JSON.stringify(value))
  } catch {
    // 書けなかった回は諦めて次へ進む。
  }
}
