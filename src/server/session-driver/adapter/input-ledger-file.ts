// 入力の控え（`InputLedger`）を `$TSUKUMO_HOME/input-ledger/<sessionId>.jsonl` に書き足し、読み、古いものを消す。
// 書けなくても読めなくても例外を投げない（控えが無ければ組み直しは包みの見分けで読む）。

import { readdirSync, rmSync, statSync } from "node:fs"
import { join } from "node:path"

import { appendJsonLines, readValidLines } from "../../adapter/lib/jsonl.ts"
import { tsukumoHomePath } from "../../adapter/tsukumo-home.ts"
import {
  EMPTY_INPUT_LEDGER,
  type InputLedger,
  type InputLedgerEntry,
  inputLedgerLineSchema,
  inputLedgerOf,
} from "../core/input-ledger.ts"
import { parseSessionId, type SessionId } from "../core/session-id.ts"

/** 更新時刻からこの日数を過ぎた控えを消す。 */
const INPUT_LEDGER_RETENTION_DAYS = 14

const DAY_MS = 24 * 60 * 60 * 1000

/** 控えのファイルの名前（`<sessionId>.jsonl`）。 */
const LEDGER_FILE_NAME = /^(.+)\.jsonl$/u

/** ターン1つ分の控えを書き足す。 */
export function appendInputLedger(entry: InputLedgerEntry, root: string = inputLedgerDir()): void {
  appendJsonLines(ledgerPath(root, entry.sessionId), entry.lines)
}

/** セッション1つの控えを読む。ID の綴りが違う・ファイルが無いときは {@link EMPTY_INPUT_LEDGER}。 */
export function readInputLedger(sessionId: string, root: string = inputLedgerDir()): InputLedger {
  const checked = parseSessionId(sessionId)
  if (checked === undefined) {
    return EMPTY_INPUT_LEDGER
  }
  const lines = readValidLines(ledgerPath(root, checked), inputLedgerLineSchema)
  return lines.length === 0 ? EMPTY_INPUT_LEDGER : inputLedgerOf(lines)
}

/** 更新時刻が {@link INPUT_LEDGER_RETENTION_DAYS} 日を過ぎた控えを消す。控えの名前でないファイルには触らない。 */
export function pruneInputLedgerFiles(now: number, root: string = inputLedgerDir()): void {
  const oldestKept = now - INPUT_LEDGER_RETENTION_DAYS * DAY_MS
  for (const name of ledgerFileNames(root)) {
    const path = join(root, name)
    try {
      if (statSync(path).mtimeMs < oldestKept) {
        rmSync(path, { force: true })
      }
    } catch {
      // 消せなかったファイルは次の起動でまた見る。
    }
  }
}

/** 既定の置き場（ホームの下）。 */
function inputLedgerDir(): string {
  return tsukumoHomePath("inputLedger")
}

function ledgerPath(root: string, sessionId: SessionId): string {
  return join(root, `${sessionId}.jsonl`)
}

function ledgerFileNames(root: string): readonly string[] {
  try {
    return readdirSync(root).filter((name) => {
      const id = LEDGER_FILE_NAME.exec(name)?.[1]
      return id !== undefined && parseSessionId(id) !== undefined
    })
  } catch {
    return []
  }
}
