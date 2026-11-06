// セッションの占有ファイルを `$TSUKUMO_HOME/session-claim/<pid>.json` に書き置き、ほかの tsukumo の占有ファイルを読む。
// 占有ファイルが生きているかは、そのプロセスが生きているか（`isProcessAlive`）だけで決める。

import { mkdirSync, rmSync } from "node:fs"
import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import process from "node:process"

import type { SessionId } from "../../../shared/session/session-id.ts"
import { writeFileAtomic } from "../../adapter/lib/atomic-file.ts"
import { tsukumoHomePath } from "../../adapter/tsukumo-home.ts"
import {
  readSessionClaimRecord,
  type SessionClaimRecord,
  type SessionClaimStore,
} from "../core/session/session-claim.ts"
import { isProcessAlive } from "./process-alive.ts"

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
  return { dir: tsukumoHomePath("sessionClaim"), ownPid: process.pid }
}

/**
 * 生きているほかのプロセスが占有ファイルに書いたセッションのID。
 * もういないプロセスの占有ファイルは消して捨てる。別の利用者のプロセス（`EPERM`）の占有ファイルは生きている占有として数え、消さない。
 * 置き場が無い・読めないときは空。
 */
export async function readOccupiedSessionIds(
  place: SessionClaimPlace,
): Promise<readonly SessionId[]> {
  // 置き場がまだ無い・読めないのは、占有が無いのと同じ
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
    // 読めない・壊れた印のファイルは、印なしとして扱う
    return undefined
  }
}

/** そのプロセスが生きているか。もういなければ占有ファイルを消す。 */
function isAlive(claim: ClaimFile): boolean {
  if (isProcessAlive(claim.record.pid)) {
    return true
  }
  removeStaleClaim(claim.path)
  return false
}

/** 消せなくても読むのは止めない（次に読む側がまた消しにくる）。 */
function removeStaleClaim(path: string): void {
  try {
    rmSync(path, { force: true })
  } catch {
    // 消せなかった占有ファイルも、生きていないので数えない。
  }
}
