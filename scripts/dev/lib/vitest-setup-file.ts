// Vitest の設定に挙がる、どのテストからも import されない準備のファイル（`globalSetup`・`setupFiles`）を、
// 設定の値から拾う、という概念1つを持つ。`projects` の入れ子の中まで読む。

import { normalize } from "node:path"

const SETUP_KEYS = ["globalSetup", "setupFiles"]

/** リポジトリの根からの相対パスで返す。見つからなければ空。 */
export function collectSetupFiles(config: unknown): readonly string[] {
  const found = new Set<string>()
  walk(config, found)
  return [...found]
}

function walk(value: unknown, found: Set<string>): void {
  if (Array.isArray(value)) {
    for (const element of value) {
      walk(element, found)
    }
    return
  }
  if (typeof value !== "object" || value === null) {
    return
  }
  for (const [key, child] of Object.entries(value)) {
    if (SETUP_KEYS.includes(key)) {
      addFiles(child, found)
    } else {
      walk(child, found)
    }
  }
}

function addFiles(value: unknown, found: Set<string>): void {
  const files = Array.isArray(value) ? value : [value]
  for (const file of files) {
    if (typeof file === "string") {
      found.add(normalize(file))
    }
  }
}
