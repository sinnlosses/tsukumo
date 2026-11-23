// 作業ディレクトリの根の地図のファイル（`.architecture-map.json`）を読む。読むのはこの1か所だけで、書かない。
// 例外を投げない。無い・読めない・壊れている・知らない版は値で返す。

import { readFile, stat } from "node:fs/promises"
import { join } from "node:path"

import {
  type ArchitectureMap,
  MAX_ARCHITECTURE_MAP_BYTES,
  type MapUnreadableReason,
} from "../../../shared/architecture-map/architecture-map.ts"
import { parseArchitectureMap } from "../core/map-parse.ts"

const ARCHITECTURE_MAP_FILE_NAME = ".architecture-map.json"

export type ArchitectureMapRead =
  | { readonly kind: "absent" }
  | { readonly kind: "unreadable"; readonly reason: MapUnreadableReason }
  | { readonly kind: "map"; readonly map: ArchitectureMap }

/** `cwd` の根の地図のファイルを、契約の型で読む。 */
export async function readArchitectureMapFile(cwd: string): Promise<ArchitectureMapRead> {
  const path = join(cwd, ARCHITECTURE_MAP_FILE_NAME)
  try {
    const stats = await stat(path)
    if (!stats.isFile()) {
      return { kind: "unreadable", reason: "read-failed" }
    }
    if (stats.size > MAX_ARCHITECTURE_MAP_BYTES) {
      return { kind: "unreadable", reason: "too-large" }
    }
    return parseArchitectureMap(await readFile(path, "utf8"))
  } catch (error) {
    // 無いファイルは異常ではなく「地図なし」。それ以外の失敗は読めない理由にする
    return isMissingFile(error) ? { kind: "absent" } : { kind: "unreadable", reason: "read-failed" }
  }
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}
