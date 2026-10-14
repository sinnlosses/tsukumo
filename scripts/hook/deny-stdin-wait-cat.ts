// 入力を与えない `cat` を、実行される前に止める
// Claude Code の PreToolUse hook（`.claude/settings.json` から Bash ツールに掛かる）。
//
// 終了コード 2 で Bash の実行を止め、stderr の中身がモデルへ返る。
// それ以外の終了コードでは実行を止めない（判定に失敗したときは通す）。

import { denyBashCall, readBashHookCall } from "./lib/hook-input.ts"
import { hasStdinWaitingCat } from "./lib/stdin-wait-denial.ts"

const REFUSAL = `入力を与えない \`cat\`（\`cat\`・\`cat > /dev/null\` など）は、標準入力を待って止まる。
中身の無い \`cat\` は書かない。ファイルを読むなら Read ツールか \`cat <file>\`、パイプで受けるなら \`cmd | cat\`、heredoc を渡すなら \`cat <<'EOF'\` で入力を与える。`

const call = await readBashHookCall()
if (call !== undefined && hasStdinWaitingCat(call.command)) {
  denyBashCall(call, { hook: "deny-stdin-wait-cat", rule: "stdin-wait-cat", refusal: REFUSAL })
}
