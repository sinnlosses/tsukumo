// 作業ツリーの中のファイルへ書き込む Bash のコマンドを、実行される前に止める
// Claude Code の PreToolUse hook（`.claude/settings.json` から Bash ツールに掛かる）。
//
// 終了コード 2 で Bash の実行を止め、stderr の中身がモデルへ返る。
// それ以外の終了コードでは実行を止めない（判定に失敗したときは通す）。

import { isAbsolute } from "node:path"
import process from "node:process"

import { findDeniedBashRule } from "./lib/bash-write-denial.ts"
import { recordHookDenial } from "./lib/hook-denial-record.ts"

const REFUSAL = `作業ツリー（CLAUDE_PROJECT_DIR）の中のファイルを Bash のコマンドで書き換えない。
止める形: \`sed -i\`・\`perl -i\`、リダイレクト（\`>\`・\`>>\`）と \`tee\` での書き込み、作業ツリーの外からの \`cp\` / \`mv\`、Python・node のコードやスクリプトでの書き込み。
書き先が作業ツリーの外のパス（別のリポジトリ・\`/tmp\`）と決まるものは止めない。
書き先が変数やコマンド置換で決まるものは、展開しないと分からないので作業ツリーの中への書き込みとみなして止める。書き先を絶対パスで書けば通る。
作業ツリーの外から画像（\`.png\`・\`.jpg\`・\`.gif\`・\`.webp\`・\`.avif\`・\`.ico\`）を \`cp\` / \`mv\` で置くのは止めない。
ファイルの書き換えは Edit ツール（複数箇所なら replace_all）か Write ツールで行うこと。
作業ツリーの外で組み立てた内容も、Write ツールで作業ツリーのパスへ書く（Bash で書き戻さない）。
\`tw edit --body-file\` に渡す下書きは Write ツールでスクラッチに書くか、heredoc を標準入力へ直接渡す。
別の git 作業ツリーにある Python スクリプトは、その作業ツリーへ \`cd\` してから走らせる（\`cd <作業ツリー> && python3 x.py\`）。
読むだけなら \`sed -n '1,5p' <file>\` は使える。生成物は \`pnpm run format\`・\`pnpm run build\` などプロジェクトのコマンドで作り直す。`

/** Bash ツールの入力のうち、この hook が見るところ。 */
type BashHookInput = {
  readonly tool_name?: unknown
  readonly tool_input?: { readonly command?: unknown }
  readonly cwd?: unknown
  readonly agent_id?: unknown
}

type BashInput = {
  readonly command: string
  readonly cwd: string | undefined
  readonly fromSubagent: boolean
}

const raw = await readStdin()
const bashInput = readBashInput(raw)
if (bashInput !== undefined) {
  const rule = findDeniedBashRule(bashInput.command, bashInput.cwd, readWorkRoot(bashInput.cwd))
  if (rule !== undefined) {
    recordHookDenial({
      hook: "deny-sed-in-place",
      rule,
      actor: bashInput.fromSubagent ? "subagent" : "main",
    })
    process.stderr.write(`${REFUSAL}\n`)
    process.exit(2)
  }
}

/** 作業ツリーの根。`CLAUDE_PROJECT_DIR`、無ければ hook の入力の `cwd`。絶対パスでなければ `undefined`。 */
function readWorkRoot(cwd: string | undefined): string | undefined {
  const candidate = process.env["CLAUDE_PROJECT_DIR"] || cwd
  return candidate !== undefined && isAbsolute(candidate) ? candidate : undefined
}

/** hook が stdin へ流す JSON から Bash のコマンド文字列と cwd を取り出す。形が違えば `undefined`。 */
function readBashInput(rawInput: string): BashInput | undefined {
  const parsed: unknown = safeParse(rawInput)
  if (typeof parsed !== "object" || parsed === null) {
    return undefined
  }

  const input = parsed as BashHookInput
  if (input.tool_name !== "Bash") {
    return undefined
  }

  const rawCommand = input.tool_input?.command
  if (typeof rawCommand !== "string") {
    return undefined
  }

  return {
    command: rawCommand,
    cwd: typeof input.cwd === "string" ? input.cwd : undefined,
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
