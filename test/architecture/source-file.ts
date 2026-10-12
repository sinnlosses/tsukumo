// 規約のテストが共有する、ソースファイルの列挙と import の specifier の読み取り。

import { readdirSync, statSync } from "node:fs"
import { fileURLToPath } from "node:url"

export const SRC_ROOT = fileURLToPath(new URL("../../src", import.meta.url)).replace(/\/$/, "")

/** `src/` 配下の `.ts` / `.tsx` を再帰的に集める。相対パス（`shared/<機能>/<名前>.ts`）で返す。 */
export function listSourceFiles(
  root: string,
  dir = root,
  extensions: readonly string[] = [".ts", ".tsx"],
): readonly string[] {
  return readdirSync(dir).flatMap((name) => {
    const fullPath = `${dir}/${name}`
    if (statSync(fullPath).isDirectory()) {
      return listSourceFiles(root, fullPath, extensions)
    }
    return extensions.some((extension) => name.endsWith(extension))
      ? [fullPath.slice(root.length + 1)]
      : []
  })
}

/** `from "./foo.ts"` / `from "../bar.ts"` の形（import・re-export の両方）をすべて拾う。 */
export function relativeImportSpecifiers(content: string): readonly string[] {
  const matches = content.matchAll(/from\s+["'](\.[^"']+)["']/g)
  return [...matches].flatMap(([, specifier]) => specifier ?? [])
}

/** `from "./..."` と副作用だけの `import "./..."` の specifier を、相対かどうかを問わずすべて拾う。 */
export function importSpecifiers(content: string): readonly string[] {
  const matches = content.matchAll(/(?:from|import)\s+["']([^"']+)["']/g)
  return [...matches].flatMap(([, specifier]) => specifier ?? [])
}

/** import 元の相対パスと specifier から、import 先の `src/` 相対パスを解く。 */
export function resolveRelativeImport(fromRelPath: string, specifier: string): string {
  const fromDirSegments = fromRelPath.split("/").slice(0, -1)
  const segments = [...fromDirSegments, ...specifier.split("/")]

  const resolved: string[] = []
  for (const segment of segments) {
    if (segment === "." || segment === "") {
      continue
    }
    if (segment === "..") {
      resolved.pop()
      continue
    }
    resolved.push(segment)
  }
  return resolved.join("/")
}
