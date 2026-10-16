// サブエージェントが E2E を全部流した回数の、着手中の1件ごとの台帳。
// 回数はこの作業ツリー固有の git dir の `e2e-full-runs` に置く。
// 鍵は開いている着手の印の `id:birthtimeMs` の並びで、印が消えて作り直されると鍵が変わり、数が戻る。
// 着手の印は tw の控えと同じ順（`.tw/local/` → `.tw/` 直下 → git dir）で探す。
// サブエージェントの Bash が走っている印は git dir の `subagent-bash/` の下に hook が置き、
// `MARK_STALE_MS` より古い印は無いものとみなす。
// 印は作業ツリーごとで呼び出し元を区別しないので、サブエージェントの Bash と同時に走る主のセッションの実行も数える。

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
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
const OPEN_CLAIMS_DIR_NAME = "task-open-claims"
const TW_DIR_NAME = ".tw"
const TW_LOCAL_DIR_NAME = "local"

/** tw が `.tw/local/` を作るときに `.tw/` 直下から移す控えの名前。1つでもあれば `.tw/` 直下が控えの置き場。 */
const TW_LEGACY_STATE_NAMES: ReadonlySet<string> = new Set([
  "task-ship-verify-owed",
  "task-verify-stamp",
  "task-pause-stamp",
  "task-step-stamps",
  OPEN_CLAIMS_DIR_NAME,
])

/** 数える場所。`workRoot` は作業ツリーの根、`gitDir` はその作業ツリー固有の git dir。 */
export type E2eRunPlace = { readonly workRoot: string; readonly gitDir: string }

/** `uncounted` はサブエージェントの印か着手の印が無くて数えなかったもの。 */
export type E2eRunRecord = "uncounted" | "counted" | "over-limit"

/** 1回を台帳に足す。足すと上限を超えるなら足さずに `over-limit`。読み書きに失敗したら `uncounted`。 */
export function recordE2eRun(place: E2eRunPlace, nowMs: number): E2eRunRecord {
  try {
    if (!hasFreshSubagentMark(place.gitDir, nowMs)) {
      return "uncounted"
    }
    const key = openClaimsKey(place)
    if (key === undefined) {
      return "uncounted"
    }
    const runsPath = join(place.gitDir, RUNS_FILE_NAME)
    const before = readRunCount(runsPath, key)
    if (before + 1 > RUN_LIMIT) {
      return "over-limit"
    }
    writeFileSync(runsPath, `${key}\n${"x\n".repeat(before + 1)}`)
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

/** 開いている着手の印を `id:birthtimeMs` で並べた鍵。印が無ければ `undefined`。 */
function openClaimsKey(place: E2eRunPlace): string | undefined {
  const claimsDir = join(twStateDirectory(place), OPEN_CLAIMS_DIR_NAME)
  if (!existsSync(claimsDir)) {
    return undefined
  }
  const ids = readdirSync(claimsDir).toSorted()
  if (ids.length === 0) {
    return undefined
  }
  return ids.map((id) => `${id}:${statSync(join(claimsDir, id)).birthtimeMs}`).join(",")
}

/** tw が控えを読む置き場。`.tw/local/` があればそこ、`.tw/` 直下に旧い控えがあればそこ、無ければ git dir。 */
function twStateDirectory(place: E2eRunPlace): string {
  const twDir = join(place.workRoot, TW_DIR_NAME)
  const localDir = join(twDir, TW_LOCAL_DIR_NAME)
  if (existsSync(localDir) && statSync(localDir).isDirectory()) {
    return localDir
  }
  if (existsSync(twDir) && readdirSync(twDir).some((name) => TW_LEGACY_STATE_NAMES.has(name))) {
    return twDir
  }
  return place.gitDir
}

/** 控えの鍵が今の鍵と同じときだけ、記録済みの回数を返す。違えば0。 */
function readRunCount(runsPath: string, key: string): number {
  if (!existsSync(runsPath)) {
    return 0
  }
  const [recordedKey, ...runLines] = readFileSync(runsPath, "utf8").split("\n")
  return recordedKey === key ? runLines.filter((line) => line !== "").length : 0
}
