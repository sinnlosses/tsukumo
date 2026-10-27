// `pnpm run check --full` の E2E の段を、作業ツリーをまたいで同時に1本だけにする排他制御。
// 共有の git dir の下のディレクトリを `mkdir` で作れた1本が占有し、消して解放する。持ち主の pid は見ず、古さだけで残りを消す。

import { mkdirSync, rmSync, statSync } from "node:fs"
import { join } from "node:path"
import process from "node:process"

import { readGitCommonDirectory } from "../../shared/git-query.ts"

const DIRECTORY_NAME = "e2e-full-lock"

const MINUTE_MS = 60_000

export type ExclusionOptions = {
  readonly waitLimitMs: number
  /** これより古い排他制御ディレクトリは、持ち主が落ちた残りとみなして消す。 */
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
  const startedAt = nowMs()
  let lastNoticeAt = Number.NEGATIVE_INFINITY
  while (true) {
    if (tryCreate(directory)) {
      return { kind: "occupied", release: releaseOnce(directory) }
    }
    if (removeIfStale(directory, options.staleMs)) {
      continue
    }
    const waitLimitMinutes = Math.round(options.waitLimitMs / MINUTE_MS)
    if (nowMs() - startedAt >= options.waitLimitMs) {
      return {
        kind: "timed-out",
        message: `別の作業ツリーの E2E 全件が ${waitLimitMinutes} 分たっても終わらないので、排他制御を占有せずに諦める。持ち主がもういないなら ${directory} を消す`,
      }
    }
    if (nowMs() - lastNoticeAt >= MINUTE_MS) {
      lastNoticeAt = nowMs()
      options.notify(
        `別の作業ツリーの E2E 全件が終わるのを待っている（最大 ${waitLimitMinutes} 分）`,
      )
    }
    await new Promise((resolve) => setTimeout(resolve, options.pollMs))
  }
}

/** 2回目からは何もしない。解放のあとに別の1本が占有したディレクトリを消さないため。 */
function releaseOnce(directory: string): () => void {
  let released = false
  return () => {
    if (released) {
      return
    }
    released = true
    rmSync(directory, { recursive: true, force: true })
  }
}

function tryCreate(directory: string): boolean {
  try {
    mkdirSync(directory)
    return true
  } catch (error) {
    if (isErrnoCode(error, "EEXIST")) {
      return false
    }
    throw error
  }
}

/** 古ければ消して `true`。`stat` の前に消えていたときも、取り直せるので `true`。 */
function removeIfStale(directory: string, staleMs: number): boolean {
  let modifiedAt: number
  try {
    modifiedAt = statSync(directory).mtimeMs
  } catch (error) {
    if (isErrnoCode(error, "ENOENT")) {
      return true
    }
    throw error
  }
  if (nowMs() - modifiedAt < staleMs) {
    return false
  }
  rmSync(directory, { recursive: true, force: true })
  return true
}

function nowMs(): number {
  return Temporal.Now.instant().epochMilliseconds
}

function isErrnoCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code
}
