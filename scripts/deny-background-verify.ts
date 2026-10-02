// 委譲先のサブエージェントが `tw verify`（検査の全段。3〜4分）を Bash の
// `run_in_background: true` で打つのを、実行される前に止める Claude Code の PreToolUse hook
// （`.claude/settings.json` から Bash ツールに掛かる）。
// メインの呼び出しには `agent_id` が入らないので対象にしない。
//
// hook の約束: 終了コード 2 で Bash の実行を止め、stderr の中身がモデルへ返る。
// それ以外の終了コードでは実行を止めない（判定に失敗したときは通す）。

import process from "node:process"

import { findQuotedSpans, withSpansBlanked } from "./lib/quoted-span.ts"

/** `tw verify` をコマンドの位置に持つ形。`verify-check`・`verify-plan` 等の別サブコマンドは拾わない。 */
const TW_VERIFY_COMMAND = /(?:^|[;&|(]\s*|\n)\s*(?:\S+=\S+\s+)*tw\s+verify\b(?!-)/

const REFUSAL = `\`tw verify\`（検査の全段。3〜4分）は背景で打たない。背景で打つと完了通知で手番が
終わり、検査が走っていないのに待ちで止まる。

前景で、Bash の \`timeout\` 引数（最大 600000）を付けて打つこと:

  tw verify   # timeout: 600000`

/** Bash ツールの PreToolUse hook の入力のうち、この hook が見るところ。 */
type PreToolUseHookInput = {
  readonly tool_name?: unknown
  readonly tool_input?: { readonly command?: unknown; readonly run_in_background?: unknown }
  readonly agent_id?: unknown
}

type BashCall = {
  readonly command: string
  readonly runsInBackground: boolean
  readonly fromSubagent: boolean
}

const raw = await readStdin()
const call = readBashCall(raw)
if (call !== undefined && isDeniedBackgroundVerify(call)) {
  process.stderr.write(`${REFUSAL}\n`)
  process.exit(2)
}

/** 委譲先が `tw verify` を背景で打つ呼び出しか。 */
function isDeniedBackgroundVerify(bashCall: BashCall): boolean {
  if (!bashCall.fromSubagent || !bashCall.runsInBackground) {
    return false
  }
  const skeleton = withSpansBlanked(bashCall.command, findQuotedSpans(bashCall.command))
  return TW_VERIFY_COMMAND.test(skeleton)
}

/** hook が stdin へ流す JSON から Bash の呼び出しを取り出す。形が違えば `undefined`。 */
function readBashCall(rawInput: string): BashCall | undefined {
  const parsed: unknown = safeParse(rawInput)
  if (typeof parsed !== "object" || parsed === null) {
    return undefined
  }

  const input = parsed as PreToolUseHookInput
  if (input.tool_name !== "Bash") {
    return undefined
  }

  const command = input.tool_input?.command
  if (typeof command !== "string") {
    return undefined
  }

  return {
    command,
    runsInBackground: input.tool_input?.run_in_background === true,
    fromSubagent: typeof input.agent_id === "string",
  }
}

function safeParse(rawInput: string): unknown {
  try {
    return JSON.parse(rawInput)
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
