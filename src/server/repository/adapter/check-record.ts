// 検証の控え（`CheckRecordSource`）を、作業ディレクトリ1つに向けて作る。
// 控えは作業ディレクトリの根の `.check-record.json` を読むだけ。木は一時の index で `git add -A` → `git write-tree` で求める。
// 一時の index と新しい object は `.git` の中の一時ディレクトリに置き、本物の index と objects には書かず、終わったら消す。

import { cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises"
import { join } from "node:path"

import { isMissingFileError } from "../../adapter/lib/missing-file-error.ts"
import type {
  CheckRecordSource,
  CheckRecordText,
  WorktreeTree,
} from "../../core/check-record-source.ts"
import { runGit } from "./git.ts"

const RECORD_FILE_NAME = ".check-record.json"
const SCRATCH_PREFIX = "tsukumo-check-tree-"

export function checkRecordSourceOf(
  cwd: string,
  env: Readonly<Record<string, string | undefined>>,
): CheckRecordSource {
  return {
    readRecordText: () => readRecordText(cwd),
    readWorktreeTree: () => readWorktreeTree(cwd, env),
  }
}

async function readRecordText(cwd: string): Promise<CheckRecordText> {
  try {
    return { kind: "text", text: await readFile(join(cwd, RECORD_FILE_NAME), "utf8") }
  } catch {
    return { kind: "unavailable" }
  }
}

async function readWorktreeTree(
  cwd: string,
  env: Readonly<Record<string, string | undefined>>,
): Promise<WorktreeTree> {
  const paths = await runGit(cwd, [
    "rev-parse",
    "--path-format=absolute",
    "--git-path",
    "index",
    "--git-path",
    "objects",
    "--git-path",
    SCRATCH_PREFIX,
  ])
  const [realIndex, realObjects, scratchPrefix] =
    paths.kind === "output" ? paths.stdout.trim().split("\n") : []
  if (realIndex === undefined || realObjects === undefined || scratchPrefix === undefined) {
    return { kind: "unknown" }
  }
  let scratch: string | undefined = undefined
  try {
    scratch = await mkdtemp(scratchPrefix)
    const index = join(scratch, "index")
    const objects = join(scratch, "objects")
    await copyIndexIfPresent(realIndex, index)
    await mkdir(objects)
    const scratchEnv = {
      ...env,
      GIT_INDEX_FILE: index,
      GIT_OBJECT_DIRECTORY: objects,
      GIT_ALTERNATE_OBJECT_DIRECTORIES: realObjects,
    }
    const added = await runGit(cwd, ["add", "-A"], scratchEnv)
    const written = added.kind === "output" ? await runGit(cwd, ["write-tree"], scratchEnv) : added
    const sha = written.kind === "output" ? written.stdout.trim() : ""
    return sha === "" ? { kind: "unknown" } : { kind: "known", sha }
  } catch {
    return { kind: "unknown" }
  } finally {
    if (scratch !== undefined) {
      await rm(scratch, { recursive: true, force: true })
    }
  }
}

// 時刻を保たないと、同じ秒・同じ大きさの書き換えを git が無変更とみなす。index が無い（まだ何も積んでいない）ときは空から始める。
async function copyIndexIfPresent(realIndex: string, index: string): Promise<void> {
  try {
    await cp(realIndex, index, { preserveTimestamps: true })
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error
    }
  }
}
