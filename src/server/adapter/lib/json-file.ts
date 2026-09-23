// `~/.tsukumo/` に置く、丸ごと置き換える形の JSON ファイル（`remembered-default.ts` の
// `state.json`・`previous-usage-review.ts`・`usage-proposal-dismissal.ts`）が同じ手で書き写して
// いた読み書きをここに1つにする。**境界（どこに・何のために書くか）は名乗らず、JSON ファイルの
// 扱い方だけを知っている**（`docs/design.md` 2章「`lib/` と `utils/` に置く基準」——`lib/jsonl.ts`
// と同じ立場で、こちらは1行ずつの JSONL ではなく1ファイル丸ごとの JSON を対象にする）。
//
// **検証はしない。** 読んだ値の形が正しいかは呼び出し元の zod スキーマに委ねる（`unknown` の
// まま返す）。書けなくても・読めなくても例外を投げない（常駐プロセスは1回の失敗で落ちない。
// `docs/coding-standards.md`「エラーハンドリング」）。

import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"

/** JSON として読む。ファイルが無い・壊れているときは undefined。 */
export function readJsonFile(path: string): unknown {
  let content: string
  try {
    content = readFileSync(path, "utf8")
  } catch {
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
    writeFileSync(path, JSON.stringify(value))
  } catch {
    // 書けなかった回は諦めて次へ進む。
  }
}
