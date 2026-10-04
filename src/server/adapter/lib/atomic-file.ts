// ファイルを途中の状態を見せずに丸ごと置き換える。
// ディレクトリは作らない。失敗は例外のまま投げ、握りつぶすかは呼び出し側が決める。

import { randomBytes } from "node:crypto"
import { renameSync, rmSync, writeFileSync } from "node:fs"

/** 同じディレクトリの一時ファイルへ書いてから rename する。失敗したら一時ファイルを消して投げ直す。 */
export function writeFileAtomic(path: string, content: string): void {
  const tempPath = `${path}.${randomBytes(6).toString("hex")}.tmp`
  try {
    writeFileSync(tempPath, content)
    renameSync(tempPath, path)
  } catch (error) {
    rmSync(tempPath, { force: true })
    throw error
  }
}
