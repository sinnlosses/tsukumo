// Bash ツールの PreToolUse で走る判定を、node の 1 回の起動にまとめた入口
// （`.claude/settings.json` から Bash ツールに掛かる）。
//
// 判定を順に当て、最初に拒んだもので止める。終了コード 2 で Bash の実行を止め、stderr の中身がモデルへ返る。
// それ以外の終了コードでは実行を止めない（判定に失敗したときは通す）。

import { findBackgroundVerifyDenial } from "./lib/background-verify.ts"
import type { BashDenial } from "./lib/bash-denial.ts"
import type { BashHookCall } from "./lib/bash-hook-call.ts"
import { findBroadKillDenial } from "./lib/broad-kill.ts"
import { findExternalSendDenial } from "./lib/external-send.ts"
import { findForeignRestoreDenial } from "./lib/foreign-restore.ts"
import { denyBashCall, readBashHookCall } from "./lib/hook-input.ts"
import { findStdinWaitCatDenial } from "./lib/stdin-wait-denial.ts"
import { findWorktreeShellWriteDenial, readWorkRoot } from "./lib/worktree-shell-write.ts"

const DENIALS = [
  findBroadKillDenial,
  (call) => findWorktreeShellWriteDenial(call, readWorkRoot(call.cwd)),
  findBackgroundVerifyDenial,
  findStdinWaitCatDenial,
  findForeignRestoreDenial,
  findExternalSendDenial,
] as const satisfies readonly ((call: BashHookCall) => BashDenial | undefined)[]

const call = await readBashHookCall()
if (call !== undefined) {
  for (const find of DENIALS) {
    const denial = find(call)
    if (denial !== undefined) {
      denyBashCall(call, denial)
    }
  }
}
