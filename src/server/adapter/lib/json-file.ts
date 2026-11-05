// 丸ごと置き換える形の JSON ファイルの読み書き。
// 境界（どこに・何のために書くか）は名乗らず、JSON ファイルの扱い方だけを知っている。
//
// 検証はしない。読んだ値の形が正しいかは呼び出し元の zod スキーマに委ねる（`unknown` のまま返す）。
// 書けなくても・読めなくても例外を投げない。

import { mkdirSync } from "node:fs"
import { dirname } from "node:path"

import { z } from "zod"

import type { DeepReadonly } from "../../../shared/report/report-block-field.ts"
import { parseJson } from "../../../shared/utils/parse-json.ts"
import { writeFileAtomic } from "./atomic-file.ts"
import { readOptionalFile } from "./optional-file.ts"

/** JSON として読む。ファイルが無い・壊れているときは undefined。 */
export function readJsonFile(path: string): unknown {
  const content = readOptionalFile(path)
  if (content === undefined) {
    return undefined
  }

  return parseJson(content)
}

/** JSON として丸ごと書く。ディレクトリが無ければ作る。失敗したその回は諦めて次へ進む。 */
export function writeJsonFile(path: string, value: unknown): void {
  writeJsonFileReporting(path, value)
}

/**
 * 版 `v` つきの JSON ファイル。`schema` は `v` を含まない本文のスキーマ。
 * 読むときは版・形が合わなければ undefined、書くときは `{ v: version, ...body }` で丸ごと書く。
 */
export function versionedJsonFile<T extends z.ZodRawShape>(options: {
  version: number
  schema: z.ZodObject<T>
  path: string
}): {
  read(): z.infer<z.ZodObject<T>> | undefined
  write(body: DeepReadonly<z.infer<z.ZodObject<T>>>): boolean
} {
  const { version, schema, path } = options
  const versionSchema = z.object({ v: z.literal(version) })

  return {
    read() {
      const raw = readJsonFile(path)
      if (!versionSchema.safeParse(raw).success) {
        return undefined
      }
      const parsed = schema.safeParse(raw)
      return parsed.success ? parsed.data : undefined
    },
    write(body) {
      return writeJsonFileReporting(path, { v: version, ...body })
    },
  }
}

function writeJsonFileReporting(path: string, value: unknown): boolean {
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileAtomic(path, JSON.stringify(value))
    return true
  } catch {
    // 書けなかった回は諦めて次へ進む。
    return false
  }
}
