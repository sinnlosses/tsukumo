// 自分の着手の印が無い作業ツリーで、未コミットの変更を消しうる git の形（restore・checkout --・clean・stash）を見つける。
// 別のセッションの未コミットの変更を消す事故を記録するための判定。

import { spawnSync } from "node:child_process"
import type { SpawnSyncReturns } from "node:child_process"

import { readOpenClaim } from "../../shared/open-claim.ts"
import type { BashDenial } from "./bash-denial.ts"
import type { BashHookCall } from "./bash-hook-call.ts"
import { isGitDryRunOption, splitGitArguments } from "./git-subcommand.ts"
import { baseName, parseShellCommand, stripPrefixes } from "./shell-command.ts"

/** 作業ツリーの状態の問い合わせ。判定できないときは `undefined`（その場合は通す）。 */
export type WorktreeProbe = {
  readonly hasUncommittedChanges: () => boolean | undefined
  readonly hasOwnClaim: () => boolean | undefined
}

const REFUSAL = `この作業ツリーには自分の着手の印が無いのに、未コミットの変更がある。
その変更は別のセッションのものかもしれない。git restore・checkout --・clean・stash は消してから気づいても戻せない。
持ち主を確かめてから打つこと（tw status --claims で印を見る）。`

/** 未コミットの変更を消しうる git を打つ呼び出しで、印が無く未コミットの変更がある作業ツリーなら拒否を返す。 */
export function findForeignRestoreDenial(
  call: BashHookCall,
  probe: WorktreeProbe = createWorktreeProbe(call.cwd),
): BashDenial | undefined {
  const rule = findDestructiveGitRule(call.command)
  if (rule === undefined) {
    return undefined
  }
  if (probe.hasUncommittedChanges() !== true || probe.hasOwnClaim() !== false) {
    return undefined
  }
  return { hook: "deny-foreign-restore", rule, refusal: REFUSAL }
}

/** 規則のキー（git のサブコマンド名）。該当する形が無ければ `undefined`。 */
function findDestructiveGitRule(bashCommand: string): string | undefined {
  for (const simple of parseShellCommand(bashCommand)) {
    const words = stripPrefixes(simple.argv)
    const [name, ...rest] = words
    if (name === undefined || baseName(name.text) !== "git") {
      continue
    }
    const { subcommand, args } = splitGitArguments(rest)
    if (subcommand === "restore" || (subcommand === "checkout" && args.includes("--"))) {
      return subcommand
    }
    if (subcommand === "clean" && !args.some(isGitDryRunOption)) {
      return subcommand
    }
    if (subcommand === "stash" && !["list", "show"].includes(args[0] ?? "")) {
      return subcommand
    }
  }
  return undefined
}

/** 実際の作業ツリー（`cwd`）を `git status` と `tw status --claims` で調べる。読めなかった問い合わせは `undefined`。 */
function createWorktreeProbe(cwd: string | undefined): WorktreeProbe {
  const options = {
    ...(cwd === undefined ? {} : { cwd }),
    encoding: "utf8",
    timeout: 5000,
  } as const
  return {
    hasUncommittedChanges: () => {
      const output = readStdout(spawnSync("git", ["status", "--porcelain"], options))
      return output === undefined ? undefined : output.trim() !== ""
    },
    hasOwnClaim: () => {
      const output = readStdout(spawnSync("tw", ["status", "--claims"], options))
      const reading = output === undefined ? "unreadable" : readOpenClaim(output)
      return reading === "unreadable" ? undefined : reading === "claimed"
    },
  }
}

function readStdout(result: SpawnSyncReturns<string>): string | undefined {
  return result.error !== undefined || result.status !== 0 ? undefined : result.stdout
}
