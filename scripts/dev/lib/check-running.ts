// 同時に走っている `pnpm run check` を、作業ツリーをまたいで数えるための印。
// 印は共有の git dir の下のディレクトリに置く、pid 名のファイル1つ。死んだ pid の印は数えるときに消す。

import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { readGitCommonDirectory } from "../../shared/git-common-directory.ts"

const DIRECTORY_NAME = "check-running"

/** 印を置くディレクトリ（git の共通 dir の中）。 */
export function runningDirectory(root: string): string {
  return join(readGitCommonDirectory(root), DIRECTORY_NAME)
}

/** 自分の印を置き、消す関数を返す。 */
export function registerRunning(directory: string, pid: number): () => void {
  mkdirSync(directory, { recursive: true })
  const mark = join(directory, String(pid))
  writeFileSync(mark, "")
  return () => rmSync(mark, { force: true })
}

/** 生きている検証の数。死んだ pid の印は消して数えない。 */
export function countRunning(directory: string, isAlive: (pid: number) => boolean): number {
  let names: string[]
  try {
    names = readdirSync(directory)
  } catch {
    return 0
  }
  let count = 0
  for (const name of names) {
    const pid = Number.parseInt(name, 10)
    if (Number.isInteger(pid) && pid > 0 && isAlive(pid)) {
      count += 1
    } else {
      rmSync(join(directory, name), { force: true })
    }
  }
  return count
}
