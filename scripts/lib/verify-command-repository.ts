// `tw verify` が打つコマンドを、リポジトリの設定ファイルの「## タスク運用」節から読む。
// 設定ファイルは `AGENTS.md`、無ければ `CLAUDE.md` の順で、節を持つ最初のものを採る。
// 打つのは `- 送る前の検証コマンド:` の行のバッククォート内、その行が無い（または `なし` で始まる）ときは
// `- 検証コマンド:` の行のもの。

import { readFileSync } from "node:fs"
import { join } from "node:path"

const CONFIG_FILE_NAMES = ["AGENTS.md", "CLAUDE.md"] as const
const TASK_SECTION_HEADING = "## タスク運用"
const PRESHIP_LABEL = "送る前の検証コマンド"
const VERIFY_LABEL = "検証コマンド"

/** `tw verify` が打つコマンド。読めない・行が無いときは空文字。 */
export function readTwVerifyCommand(root: string): string {
  const text = readConfigText(root)
  if (text === undefined) {
    return ""
  }
  return readCommandLine(text, PRESHIP_LABEL) ?? readCommandLine(text, VERIFY_LABEL) ?? ""
}

function readConfigText(root: string): string | undefined {
  for (const name of CONFIG_FILE_NAMES) {
    const text = readTextOrUndefined(join(root, name))
    if (text?.split("\n").some((line) => line.startsWith(TASK_SECTION_HEADING)) === true) {
      return text
    }
  }
  return undefined
}

function readTextOrUndefined(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8")
  } catch {
    return undefined
  }
}

function readCommandLine(text: string, label: string): string | undefined {
  const value = new RegExp(`^- ${label}:\\s*(.*)$`, "m").exec(text)?.[1]?.trim()
  if (value === undefined || value.startsWith("なし")) {
    return undefined
  }
  return /`([^`]+)`/.exec(value)?.[1]
}
