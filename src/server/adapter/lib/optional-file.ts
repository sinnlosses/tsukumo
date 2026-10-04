import { readFileSync } from "node:fs"

/** 読めなければ `undefined` を返す（無いこと自体はエラーではない読み取りに共通で使う）。 */
export function readOptionalFile(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8")
  } catch {
    return undefined
  }
}

export function readOptionalBinaryFile(path: string): Buffer | undefined {
  try {
    return readFileSync(path)
  } catch {
    return undefined
  }
}
