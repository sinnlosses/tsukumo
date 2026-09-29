// ファイルを書き換える `sed -i` を、実行される前に止める Claude Code の PreToolUse hook
// （`.claude/settings.json` から Bash ツールに掛かる）。書き換えは Edit ツールで行う。
//
// 終了コード 2 で Bash の実行を止め、stderr の中身がモデルへ返る。
// それ以外の終了コードでは実行を止めない（判定に失敗したときは通す）。

import process from "node:process"

/** コマンドの位置（`sudo` `xargs` の後ろを含む）に現れた `sed` に、in-place の引数（`-i`・`-i.bak`・`-ni`・`--in-place`）が続く形。 */
const SED_IN_PLACE =
  /(?:^|[;&|(]\s*|\n)\s*(?:(?:sudo|xargs)\s+(?:-\S+\s+)*)?sed\b[^;&|\n]*\s(?:-[a-zA-Z]*i|--in-place)/

const REFUSAL = `Bash の \`sed -i\` でファイルを書き換えない。BSD と GNU で引数が違い、置換の当たりも確かめられない。
ファイルの書き換えは Edit ツール（複数箇所なら replace_all）か Write ツールで行うこと。
読むだけなら \`sed -n '1,5p' <file>\` は使える。`

/** Bash ツールの入力のうち、この hook が見るところ。 */
type BashHookInput = {
  readonly tool_name?: unknown
  readonly tool_input?: { readonly command?: unknown }
}

const raw = await readStdin()
const command = readBashCommand(raw)
if (command !== undefined && SED_IN_PLACE.test(command)) {
  process.stderr.write(`${REFUSAL}\n`)
  process.exit(2)
}

/** hook が stdin へ流す JSON から Bash のコマンド文字列を取り出す。形が違えば `undefined`。 */
function readBashCommand(rawInput: string): string | undefined {
  const parsed: unknown = safeParse(rawInput)
  if (typeof parsed !== "object" || parsed === null) {
    return undefined
  }

  const input = parsed as BashHookInput
  if (input.tool_name !== "Bash") {
    return undefined
  }

  const bashCommand = input.tool_input?.command
  return typeof bashCommand === "string" ? bashCommand : undefined
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
