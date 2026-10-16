// セッションの占有ファイルを `$TSUKUMO_HOME/session-claim/<pid>.json` に書き置き、ほかの tsukumo の占有ファイルを読む。
// 占有ファイルが生きているかは、そのプロセスが生きているか（`process.kill(pid, 0)`）だけで決める。

import { mkdirSync, rmSync } from "node:fs"
import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import process from "node:process"

import { writeFileAtomic } from "../../adapter/lib/atomic-file.ts"
import { tsukumoHomeDir } from "../../adapter/tsukumo-home.ts"
import {
  readSessionClaimRecord,
  type SessionClaimRecord,
  type SessionClaimStore,
} from "../core/session-claim.ts"

/** ホームの下の占有ファイルの置き場の名前。 */
export const SESSION_CLAIM_DIR_NAME = "session-claim"

/** 占有ファイルの名前（`<pid>.json`）。 */
const CLAIM_FILE_NAME = /^\d+\.json$/u

/** 占有ファイルの置き場と、自分として扱う pid。 */
export type SessionClaimPlace = {
  readonly dir: string
  readonly ownPid: number
}

/** このプロセスの占有ファイルの書き置き。書けなかった失敗は投げずに `reportFailure` へ渡す。 */
export function createSessionClaimFile(options: {
  readonly place: SessionClaimPlace
  readonly reportFailure: (error: unknown) => void
}): SessionClaimStore {
  const { place } = options
  const path = claimPath(place.dir, place.ownPid)
  return {
    write: (sessionIds) => {
      try {
        if (sessionIds.length === 0) {
          rmSync(path, { force: true })
          return
        }
        mkdirSync(place.dir, { recursive: true })
        const record: SessionClaimRecord = { pid: place.ownPid, sessionIds }
        writeFileAtomic(path, JSON.stringify(record))
      } catch (error) {
        options.reportFailure(error)
      }
    },
    readOthers: () => readOccupiedSessionIds(place),
  }
}

/** 既定の置き場（ホームの下）と、このプロセスの pid。 */
export function defaultSessionClaimPlace(): SessionClaimPlace {
  return { dir: join(tsukumoHomeDir(), SESSION_CLAIM_DIR_NAME), ownPid: process.pid }
}

/**
 * 生きているほかのプロセスが占有ファイルに書いたセッションのID。
 * もういないプロセスの占有ファイルは消して捨て、別の利用者のプロセス（`EPERM`）の占有ファイルも捨てる。
 * 置き場が無い・読めないときは空。
 */
export async function readOccupiedSessionIds(place: SessionClaimPlace): Promise<readonly string[]> {
  const names = await readdir(place.dir).catch(() => [])
  const records = await Promise.all(
    names
      .filter((name) => CLAIM_FILE_NAME.test(name))
      .map((name) => readClaimFile(join(place.dir, name))),
  )
  return records
    .flatMap((claim) => (claim === undefined || claim.record.pid === place.ownPid ? [] : [claim]))
    .filter((claim) => isAlive(claim))
    .flatMap((claim) => claim.record.sessionIds)
}

function claimPath(dir: string, pid: number): string {
  return join(dir, `${String(pid)}.json`)
}

type ClaimFile = { readonly path: string; readonly record: SessionClaimRecord }

async function readClaimFile(path: string): Promise<ClaimFile | undefined> {
  try {
    const record = readSessionClaimRecord(JSON.parse(await readFile(path, "utf8")))
    return record === undefined ? undefined : { path, record }
  } catch {
    return undefined
  }
}

/** そのプロセスが生きているか。もういなければ占有ファイルを消す。 */
function isAlive(claim: ClaimFile): boolean {
  try {
    process.kill(claim.record.pid, 0)
    return true
  } catch (error) {
    if (isErrorCode(error, "ESRCH")) {
      removeStaleClaim(claim.path)
    }
    return false
  }
}

/** 消せなくても読むのは止めない（次に読む側がまた消しにくる）。 */
function removeStaleClaim(path: string): void {
  try {
    rmSync(path, { force: true })
  } catch {
    // 消せなかった占有ファイルも、生きていないので数えない。
  }
}

function isErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code
}
