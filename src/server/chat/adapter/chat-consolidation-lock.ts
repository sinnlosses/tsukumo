// 定着をプロセスをまたいで1本にする錠（`<パック名>/consolidation.lock`）。
// 錠のファイルを排他で作れたときだけ取れる。中身は書いた時刻だけで、古さはファイルの更新時刻で測る。

import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { isCharacterPackName } from "../../../shared/character-pack/character.ts"
import { isoWithOffset } from "../../adapter/local-time.ts"
import type {
  ChatConsolidationLock,
  ChatConsolidationWriterPorts,
} from "../core/chat-consolidation-writer.ts"
import { chatArchiveDir } from "./chat-archive.ts"

/** 定着の錠の名前。 */
const CONSOLIDATION_LOCK_FILE_NAME = "consolidation.lock"

/**
 * 錠を取る口を作る。`root` は置き場の親（既定は {@link chatArchiveDir}）。
 * 書いてから `staleAfterMs` を過ぎた錠は、落ちたプロセスの残りとして消して取り直す。
 */
export function createChatConsolidationLock(
  root: string = chatArchiveDir(),
): ChatConsolidationWriterPorts["lockConsolidation"] {
  return (packName, staleAfterMs, now) => {
    if (!isCharacterPackName(packName)) {
      return undefined
    }

    const path = join(root, packName, CONSOLIDATION_LOCK_FILE_NAME)
    if (createLockFile(path, now)) {
      return releasableLock(path)
    }
    if (!isStaleLock(path, staleAfterMs, now)) {
      return undefined
    }
    removeLockFile(path)
    return createLockFile(path, now) ? releasableLock(path) : undefined
  }
}

/** 錠のファイルを排他（`wx`）で作る。既にある・作れないときは `false`。 */
function createLockFile(path: string, now: Temporal.Instant): boolean {
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, isoWithOffset(now.epochMilliseconds), { flag: "wx" })
    return true
  } catch {
    return false
  }
}

/** 錠が書いてから `staleAfterMs` を過ぎているか。読めない（消えた）錠も取り直してよい側に倒す。 */
function isStaleLock(path: string, staleAfterMs: number, now: Temporal.Instant): boolean {
  try {
    return now.epochMilliseconds - statSync(path).mtimeMs > staleAfterMs
  } catch {
    return true
  }
}

function releasableLock(path: string): ChatConsolidationLock {
  return {
    release: () => {
      removeLockFile(path)
    },
  }
}

function removeLockFile(path: string): void {
  try {
    rmSync(path, { force: true })
  } catch {
    // 消せなかった錠は、古さの閾値を過ぎたところで次の誰かが取り直す。
  }
}
