// サブエージェントの Bash の印を消す Claude Code の hook（`.claude/settings.json` から Bash ツールの
// PostToolUse・PostToolUseFailure に掛かる。PreToolUse で置くのは Bash の判定を束ねた入口）。
// Bash の実行は止めない。

import { readBashHookCall } from "./lib/hook-input.ts"
import { handleSubagentMark } from "./lib/subagent-mark.ts"

const call = await readBashHookCall()
if (call !== undefined) {
  handleSubagentMark(call)
}
