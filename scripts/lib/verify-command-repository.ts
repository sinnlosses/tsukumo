// `tw verify` が打つコマンドを、`.tw/config.toml` から `tw` を呼ばずに直に読む。
// 読む形は空行・`# コメント`・`key = "値"`（`'値'` も可、行末コメント可）だけ。
// 打つのは `verify_before_ship` の値、無ければ `verify` の値。値が `なし` のキーは無いのと同じに扱う。

import { readFileSync } from "node:fs"
import { join } from "node:path"

const CONFIG_PATH = ".tw/config.toml"
const PRESHIP_KEY = "verify_before_ship"
const VERIFY_KEY = "verify"
const NONE_VALUE = "なし"
const ASSIGNMENT = /^([A-Za-z0-9_-]+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|'([^']*)')\s*(?:#.*)?$/

/** `tw verify` が打つコマンド。読めない・キーが無いときは空文字。 */
export function readTwVerifyCommand(root: string): string {
  const text = readTextOrUndefined(join(root, CONFIG_PATH))
  if (text === undefined) {
    return ""
  }
  const values = readValues(text)
  return commandOf(values.get(PRESHIP_KEY)) ?? commandOf(values.get(VERIFY_KEY)) ?? ""
}

function readTextOrUndefined(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8")
  } catch {
    return undefined
  }
}

function readValues(text: string): Map<string, string> {
  const values = new Map<string, string>()
  for (const line of text.split("\n")) {
    const match = ASSIGNMENT.exec(line.trim())
    if (match?.[1] !== undefined) {
      values.set(match[1], match[2]?.replace(/\\(["\\])/g, "$1") ?? match[3] ?? "")
    }
  }
  return values
}

function commandOf(value: string | undefined): string | undefined {
  return value === undefined || value === NONE_VALUE || value === "" ? undefined : value
}
