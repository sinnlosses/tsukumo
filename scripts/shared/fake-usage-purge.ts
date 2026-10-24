// 使用量の記録（日付ごとの JSONL）から、疑似セッションの行だけを取り除く。
// 行の中身は読み出さず出さない。見るのは `sessionId` の欄だけで、読めない行は残す。

import { readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const FAKE_SESSION_ID = "fake-session"
const DATE_FILE_NAME = /^\d{4}-\d{2}-\d{2}\.jsonl$/

export type PurgeCount = {
  readonly removed: number
  readonly kept: number
}

/**
 * `dir` の日付ファイルから疑似セッションの行を消す（`dryRun` なら数えるだけ）。
 * 消す行があるファイルだけ、一時ファイルへ書いて置き換える。置き場が無ければ 0 件。
 */
export function purgeFakeRows(dir: string, dryRun: boolean): PurgeCount {
  let removed = 0
  let kept = 0
  for (const name of dateFileNames(dir)) {
    const path = join(dir, name)
    const lines = readFileSync(path, "utf8").split("\n")
    const remaining = lines.filter((line) => !isFakeRow(line))
    const dropped = lines.length - remaining.length
    removed += dropped
    kept += remaining.filter((line) => line.length > 0).length
    if (dropped > 0 && !dryRun) {
      const temporary = `${path}.purge`
      writeFileSync(temporary, remaining.join("\n"))
      renameSync(temporary, path)
    }
  }
  return { removed, kept }
}

function dateFileNames(dir: string): readonly string[] {
  try {
    return readdirSync(dir).filter((name) => DATE_FILE_NAME.test(name))
  } catch {
    return []
  }
}

function isFakeRow(line: string): boolean {
  if (!line.includes(FAKE_SESSION_ID)) {
    return false
  }
  try {
    const parsed: unknown = JSON.parse(line)
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      "sessionId" in parsed &&
      parsed.sessionId === FAKE_SESSION_ID
    )
  } catch {
    return false
  }
}
