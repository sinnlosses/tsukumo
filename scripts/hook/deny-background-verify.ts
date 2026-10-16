// 委譲先のサブエージェントが `tw verify`（検査の全段。3〜4分）を Bash の
// `run_in_background: true` で打つのを、実行される前に止める Claude Code の PreToolUse hook
// （`.claude/settings.json` から Bash ツールに掛かる）。
// メインの呼び出しには `agent_id` が入らないので対象にしない。
//
// hook の約束: 終了コード 2 で Bash の実行を止め、stderr の中身がモデルへ返る。
// それ以外の終了コードでは実行を止めない（判定に失敗したときは通す）。

import { runsTwVerify } from "./lib/background-verify.ts"
import { type BashHookCall, denyBashCall, readBashHookCall } from "./lib/hook-input.ts"

const REFUSAL = `\`tw verify\`（検査の全段。3〜4分）は背景で打たない。背景で打つと完了通知で手番が
終わり、検査が走っていないのに待ちで止まる。

前景で、Bash の \`timeout\` 引数（最大 600000）を付けて打つこと:

  tw verify   # timeout: 600000`

const call = await readBashHookCall()
if (call !== undefined && isDeniedBackgroundVerify(call)) {
  denyBashCall(call, {
    hook: "deny-background-verify",
    rule: "background-verify",
    refusal: REFUSAL,
  })
}

/** 委譲先が `tw verify` を背景で打つ呼び出しか。 */
function isDeniedBackgroundVerify(bashCall: BashHookCall): boolean {
  if (!bashCall.fromSubagent || !bashCall.runsInBackground) {
    return false
  }
  return runsTwVerify(bashCall.command)
}
