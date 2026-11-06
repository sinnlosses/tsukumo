// `pnpm run check --full` の E2E の段を、作業ツリーをまたいで同時に1本だけにする排他制御。
// 共有の git dir の下のディレクトリを `proper-lockfile` が占有し、持っている間は更新時刻を書き直し続ける。
// 持ち主の pid は見ず、更新が止まって `staleMs` たった錠だけを、落ちた持ち主の残りとして奪う。

import { join } from "node:path"
import process from "node:process"

import { lock, unlockSync } from "proper-lockfile"

import { hasErrorCode } from "../../../src/server/core/utils/error-code.ts"
import { readGitCommonDirectory } from "../../shared/git-query.ts"

const DIRECTORY_NAME = "e2e-full-lock"

const MINUTE_MS = 60_000

export type ExclusionOptions = {
  readonly waitLimitMs: number
  /** 更新が止まってからこれだけたつと、持ち主が落ちたとみなして奪われる。 */
  readonly staleMs: number
  readonly pollMs: number
  readonly notify: (line: string) => void
}

export type ExclusionResult =
  | { readonly kind: "occupied"; readonly release: () => void }
  | { readonly kind: "timed-out"; readonly message: string }

export const DEFAULT_EXCLUSION_OPTIONS = {
  waitLimitMs: 15 * MINUTE_MS,
  staleMs: 15 * MINUTE_MS,
  pollMs: 2_000,
  notify: (line) => process.stdout.write(`${line}\n`),
} satisfies ExclusionOptions

/** 排他制御ディレクトリのパス（git の共通 dir の中）。 */
export function e2eExclusionDirectory(root: string): string {
  return join(readGitCommonDirectory(root), DIRECTORY_NAME)
}

/** 排他制御を占有するまで待つ。待ちが上限を超えたら占有せず、ディレクトリも消さずに諦める。 */
export async function occupyE2eExclusion(
  directory: string,
  options: ExclusionOptions,
): Promise<ExclusionResult> {
  const lockOptions = {
    lockfilePath: directory,
    realpath: false,
    stale: options.staleMs,
    update: Math.floor(options.staleMs / 2),
    onCompromised: () =>
      options.notify(
        "E2E 全件の排他制御の更新ができず、錠を奪われた可能性がある。別の作業ツリーの E2E と重なっているかもしれない",
      ),
  }
  const waitLimitMinutes = Math.round(options.waitLimitMs / MINUTE_MS)
  try {
    await lock(directory, { ...lockOptions, retries: 0 })
  } catch (error) {
    if (!hasErrorCode(error, "ELOCKED")) {
      throw error
    }
    options.notify(`別の作業ツリーの E2E 全件が終わるのを待っている（最大 ${waitLimitMinutes} 分）`)
    try {
      await lock(directory, {
        ...lockOptions,
        retries: {
          retries: Math.ceil(options.waitLimitMs / options.pollMs),
          factor: 1,
          minTimeout: options.pollMs,
          maxTimeout: options.pollMs,
        },
      })
    } catch (retryError) {
      if (!hasErrorCode(retryError, "ELOCKED")) {
        throw retryError
      }
      return {
        kind: "timed-out",
        message: `別の作業ツリーの E2E 全件が ${waitLimitMinutes} 分たっても終わらないので、排他制御を占有せずに諦める。持ち主がもういないなら ${directory} を消す`,
      }
    }
  }
  return { kind: "occupied", release: releaseOnce(directory) }
}

/** 2回目からは何もしない。解放のあとに別の1本が占有したディレクトリを消さないため。 */
function releaseOnce(directory: string): () => void {
  let released = false
  return () => {
    if (released) {
      return
    }
    released = true
    unlockSync(directory, { lockfilePath: directory, realpath: false })
  }
}
