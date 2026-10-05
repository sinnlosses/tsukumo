// 入力を与えない `cat` を、実行される前に止める
// Claude Code の PreToolUse hook（`.claude/settings.json` から Bash ツールに掛かる）。
//
// 終了コード 2 で Bash の実行を止め、stderr の中身がモデルへ返る。
// それ以外の終了コードでは実行を止めない（判定に失敗したときは通す）。

import process from "node:process"

import { recordHookDenial } from "./lib/hook-denial-record.ts"
import { hasStdinWaitingCat } from "./lib/stdin-wait-denial.ts"

const REFUSAL = `入力を与えない \`cat\`（\`cat\`・\`cat > /dev/null\` など）は、標準入力を待って止まる。
中身の無い \`cat\` は書かない。ファイルを読むなら Read ツールか \`cat <file>\`、パイプで受けるなら \`cmd | cat\`、heredoc を渡すなら \`cat <<'EOF'\` で入力を与える。`

type BashHookInput = {
  readonly tool_name?: unknown
  readonly tool_input?: { readonly command?: unknown }
  readonly agent_id?: unknown
}

const input = parseInput(await readStdin())
if (
  input?.tool_name === "Bash" &&
  typeof input.tool_input?.command === "string" &&
  hasStdinWaitingCat(input.tool_input.command)
) {
  recordHookDenial({
    hook: "deny-stdin-wait-cat",
    rule: "stdin-wait-cat",
    actor: typeof input.agent_id === "string" ? "subagent" : "main",
  })
  process.stderr.write(`${REFUSAL}\n`)
  process.exit(2)
}

function parseInput(rawInput: string): BashHookInput | undefined {
  try {
    const parsed: unknown = JSON.parse(rawInput)
    return typeof parsed === "object" && parsed !== null ? (parsed as BashHookInput) : undefined
  } catch {
    return undefined
  }
}

async function readStdin(): Promise<string> {
  const chunks: string[] = []
  process.stdin.setEncoding("utf8")
  for await (const chunk of process.stdin) {
    chunks.push(chunk as string)
  }
  return chunks.join("")
}
