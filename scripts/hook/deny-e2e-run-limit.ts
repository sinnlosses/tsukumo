// 委譲先のサブエージェントが E2E を全部流すコマンド（`tw verify`・`pnpm run check`・
// `pnpm run test:e2e` など）を、着手中の1件の中で上限を超えて打つのを、実行される前に止める
// Claude Code の PreToolUse hook（`.claude/settings.json` から Bash ツールに掛かる）。
// メインの呼び出しには `agent_id` が入らないので対象にしない。E2E のファイル単位の実行は数えない。
//
// hook の約束: 終了コード 2 で Bash の実行を止め、stderr の中身がモデルへ返る。
// それ以外の終了コードでは実行を止めない（判定に失敗したときは通す）。

import process from "node:process"

import { collectChangedPaths, PRIMARY_BRANCH } from "../shared/changed-path-repository.ts"
import { planE2eRun } from "../shared/e2e-selection-repository.ts"
import { queryGit } from "../shared/git-query.ts"
import { readTwVerifyCommand } from "../shared/verify-command-repository.ts"
import {
  countE2eRuns,
  countFullE2eRuns,
  isOverLimitAfterRecording,
  RUN_LIMIT,
} from "./lib/e2e-run-limit.ts"
import { denyBashCall, readBashHookCall } from "./lib/hook-input.ts"

const call = await readBashHookCall()
if (call?.fromSubagent === true) {
  const counts = countE2eRuns(call.command, readTwVerifyCommandOfProject())
  const changeRunsE2e = counts.byChange > 0 && (await readChangeRunsE2e())
  const runs = countFullE2eRuns(counts, changeRunsE2e)
  const gitDir = runs > 0 ? readGitDir() : undefined
  if (gitDir !== undefined && isOverLimitAfterRecording(gitDir, runs)) {
    denyBashCall(call, { hook: "deny-e2e-run-limit", rule: "run-limit", refusal: refusal() })
  }
}

function refusal(): string {
  return `E2E を全部流す呼び出し（\`tw verify\`・\`pnpm run check\`・\`pnpm run test:e2e\`）が、
着手中の1件の上限（${RUN_LIMIT}回）に達した。これ以上は打たない。

E2E のファイル単位の実行は数えないので打ってよい:

  pnpm run test:e2e test/e2e/<ファイル>.test.ts`
}

/** `tw verify` が打つコマンド。作業ツリーの根が引けなければ空文字。 */
function readTwVerifyCommandOfProject(): string {
  const root = readGit(["rev-parse", "--show-toplevel"])
  return root === undefined ? "" : readTwVerifyCommand(root)
}

/** この作業ツリーの git dir。引けなければ `undefined`。 */
function readGitDir(): string | undefined {
  return readGit(["rev-parse", "--path-format=absolute", "--git-dir"])
}

/** 変えたファイルから選ぶと `check` が E2E を流すか。調べられないときは流さない側に倒す。 */
async function readChangeRunsE2e(): Promise<boolean> {
  try {
    const root = readGit(["rev-parse", "--show-toplevel"])
    if (root === undefined) {
      return false
    }
    const changedPaths = collectChangedPaths(root, PRIMARY_BRANCH)
    return planE2eRun(root, changedPaths, false).kind === "run"
  } catch {
    return false
  }
}

function readGit(args: readonly string[]): string | undefined {
  return queryGit(process.env["CLAUDE_PROJECT_DIR"] ?? process.cwd(), args)?.trim()
}
