// サブエージェントが E2E を全部流した回数の、着手中の1件ごとの台帳。
// 回数はこの作業ツリー固有の git dir の `e2e-full-runs` に、`{key, count}` の JSON で置く。
// 鍵は `tw status --claims` の着手の同一性の鍵（`claim`）で、着手し直すと鍵が変わり、数が戻る。
// 着手が1件でないときと口が読めないときは数えない。tw の内部の置き場は読まない。
// サブエージェントの Bash が走っている印は git dir の `subagent-bash/` の下に hook が置き、
// `MARK_STALE_MS` より古い印は無いものとみなす。
// 印は作業ツリーごとで呼び出し元を区別しないので、サブエージェントの Bash と同時に走る主のセッションの実行も数える。

import { execFileSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"

/** 着手中の1件につき、E2E を全部流してよい回数。 */
export const RUN_LIMIT = 6

/** サブエージェントの Bash が走っている印を置く、git dir の下のディレクトリの名前。 */
export const SUBAGENT_BASH_MARK_DIRECTORY = "subagent-bash"

/** Bash の timeout の上限。これより古い印は、消し損ねたものとみなす。 */
const MARK_STALE_MS = 600_000

/** 印のファイル名にしてよい `tool_use_id` の形。 */
const MARK_NAME = /^[\w-]+$/

const RUNS_FILE_NAME = "e2e-full-runs"
const TW_CLAIMS_TIMEOUT_MS = 5000

/** 数える場所。`workRoot` は作業ツリーの根、`gitDir` はその作業ツリー固有の git dir。 */
export type E2eRunPlace = { readonly workRoot: string; readonly gitDir: string }

/** `uncounted` はサブエージェントの印か着手の印が無くて数えなかったもの。 */
export type E2eRunRecord = "uncounted" | "counted" | "over-limit"

/**
 * 1回を台帳に足す。足すと上限を超えるなら足さずに `over-limit`。読み書きに失敗したら `uncounted`。
 * `readClaimKey` は着手の同一性の鍵を返す（既定は {@link readTwClaimKey}）。
 */
export function recordE2eRun(
  place: E2eRunPlace,
  nowMs: number,
  readClaimKey: (workRoot: string) => string | undefined = readTwClaimKey,
): E2eRunRecord {
  try {
    if (!hasFreshSubagentMark(place.gitDir, nowMs)) {
      return "uncounted"
    }
    const key = readClaimKey(place.workRoot)
    if (key === undefined) {
      return "uncounted"
    }
    const runsPath = join(place.gitDir, RUNS_FILE_NAME)
    const before = readRunCount(runsPath, key)
    if (before + 1 > RUN_LIMIT) {
      return "over-limit"
    }
    writeRunCount(runsPath, key, before + 1)
    return "counted"
  } catch {
    return "uncounted"
  }
}

/** サブエージェントの Bash が走っている印のうち、古くないものが1つでもあるか。 */
export function hasFreshSubagentMark(gitDir: string, nowMs: number): boolean {
  const directory = join(gitDir, SUBAGENT_BASH_MARK_DIRECTORY)
  if (!existsSync(directory)) {
    return false
  }
  return readdirSync(directory).some(
    (name) => nowMs - statSync(join(directory, name)).mtimeMs < MARK_STALE_MS,
  )
}

/** `toolUseId` の Bash が走っている印を置く。名前に使えない ID は置かない。 */
export function placeSubagentMark(gitDir: string, toolUseId: string): void {
  if (!MARK_NAME.test(toolUseId)) {
    return
  }
  const directory = join(gitDir, SUBAGENT_BASH_MARK_DIRECTORY)
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, toolUseId), "")
}

/** `toolUseId` の印を消す。無ければ何もしない。 */
export function removeSubagentMark(gitDir: string, toolUseId: string): void {
  if (MARK_NAME.test(toolUseId)) {
    rmSync(join(gitDir, SUBAGENT_BASH_MARK_DIRECTORY, toolUseId), { force: true })
  }
}

/** `tw status --claims` が返す、着手が1件のときのその同一性の鍵。打てない・読めない・1件でないときは `undefined`。 */
export function readTwClaimKey(workRoot: string): string | undefined {
  try {
    const output = execFileSync("tw", ["status", "--claims"], {
      cwd: workRoot,
      timeout: TW_CLAIMS_TIMEOUT_MS,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
    const parsed: unknown = JSON.parse(output)
    const claims = isRecord(parsed) ? parsed["claims"] : undefined
    if (!Array.isArray(claims) || claims.length !== 1) {
      return undefined
    }
    const claim: unknown = claims[0]
    const key = isRecord(claim) ? claim["claim"] : undefined
    return typeof key === "string" && key !== "" ? key : undefined
  } catch {
    return undefined
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

/** 台帳の鍵が今の鍵と同じときだけ、記録済みの回数を返す。違う・読めないなら0。 */
function readRunCount(runsPath: string, key: string): number {
  if (!existsSync(runsPath)) {
    return 0
  }
  try {
    const recorded: unknown = JSON.parse(readFileSync(runsPath, "utf8"))
    if (!isRecord(recorded) || recorded["key"] !== key) {
      return 0
    }
    const count = recorded["count"]
    return typeof count === "number" && Number.isInteger(count) && count > 0 ? count : 0
  } catch {
    return 0
  }
}

/** 一時ファイルに書いてから名前を変える（読む側に書きかけが見えない）。 */
function writeRunCount(runsPath: string, key: string, count: number): void {
  const temporaryPath = `${runsPath}.${process.pid}.tmp`
  writeFileSync(temporaryPath, JSON.stringify({ key, count }))
  renameSync(temporaryPath, runsPath)
}
