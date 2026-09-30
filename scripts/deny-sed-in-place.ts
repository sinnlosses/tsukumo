// ファイルを書き換える `sed -i`・`perl -pi` / `perl -i`・Python の書き込みを、実行される前に止める
// Claude Code の PreToolUse hook（`.claude/settings.json` から Bash ツールに掛かる）。
// 書き換えは Edit ツールで行う。
//
// 終了コード 2 で Bash の実行を止め、stderr の中身がモデルへ返る。
// それ以外の終了コードでは実行を止めない（判定に失敗したときは通す）。

import process from "node:process"

import { findQuotedSpans, withSpansBlanked, type QuotedSpan } from "./lib/quoted-span.ts"

/** コマンドの位置（`sudo` `xargs` の後ろを含む）に現れた `sed` に、in-place の引数（`-i`・`-i.bak`・`-ni`・`--in-place`）が続く形。 */
const SED_IN_PLACE =
  /(?:^|[;&|(]\s*|\n)\s*(?:(?:sudo|xargs)\s+(?:-\S+\s+)*)?sed\b[^;&|\n]*\s(?:-[a-zA-Z]*i|--in-place)/

/** コマンドの位置に現れた `perl` に、in-place の引数（`-i`・`-i.bak`・`-pi` のような束ね方を含む）が続く形。 */
const PERL_IN_PLACE =
  /(?:^|[;&|(]\s*|\n)\s*(?:(?:sudo|xargs)\s+(?:-\S+\s+)*)?perl\b[^;&|\n]*\s-[a-zA-Z]*i[a-zA-Z]*\b/

/** Python のコードの中にある、ファイルへ書き戻す呼び出し。 */
const PYTHON_WRITE_CALL =
  /open\([^)]*,\s*["'][waxWAX]|open\([^)]*mode\s*=\s*["'][waxWAX]|\.write_text\(|\.write_bytes\(|shutil\.move\(|os\.rename\(|os\.replace\(/

/** heredoc の直前のコマンド語が、素の `python3`（引数無しまたは `-` のみ）である形。この heredoc の本文はコードとして実行される。 */
const PYTHON_HEREDOC_SCRIPT = /(?:^|[\s;&|(])(?:\S+=\S+\s+)*python3?(\s+-)?\s*$/

/** 引用符の直前が `python3 ... -c` である形。この引用符の中身はコードとして実行される。 */
const PYTHON_DASH_C_SCRIPT = /(?:^|[\s;&|(])(?:\S+=\S+\s+)*python3?\s+(?:-\S+\s+)*-c\s*$/

const REFUSAL = `Bash の \`sed -i\`・\`perl -pi\` / \`perl -i\`・Python の書き込みでファイルを書き換えない。
BSD と GNU で引数が違い、置換の当たりも確かめられない。
ファイルの書き換えは Edit ツール（複数箇所なら replace_all）か Write ツールで行うこと。
読むだけなら \`sed -n '1,5p' <file>\` は使える。`

/** Bash ツールの入力のうち、この hook が見るところ。 */
type BashHookInput = {
  readonly tool_name?: unknown
  readonly tool_input?: { readonly command?: unknown }
}

const raw = await readStdin()
const bashCommand = readBashCommand(raw)
if (bashCommand !== undefined && isDeniedCommand(bashCommand)) {
  process.stderr.write(`${REFUSAL}\n`)
  process.exit(2)
}

/** コマンドが `sed -i`・`perl -pi` 等の構造に当たるか、引用符・heredoc の中で Python がファイルへ書き戻すコードを持つかを見る。 */
function isDeniedCommand(command: string): boolean {
  const spans = findQuotedSpans(command)
  if (
    spans.some(
      (span) => isExecutedPythonCode(command, span) && PYTHON_WRITE_CALL.test(span.content),
    )
  ) {
    return true
  }

  const skeleton = withSpansBlanked(command, spans)
  return SED_IN_PLACE.test(skeleton) || PERL_IN_PLACE.test(skeleton)
}

/** 引用符・heredoc の範囲のうち、データではなくコードとして実行されるもの（`python3` の heredoc・`python3 -c` の引用符）。 */
function isExecutedPythonCode(command: string, span: QuotedSpan): boolean {
  const before = `${precedingText(command, span.start)} `
  return span.kind === "heredoc"
    ? PYTHON_HEREDOC_SCRIPT.test(before)
    : PYTHON_DASH_C_SCRIPT.test(before)
}

/** コマンドのうち、直近のコマンドの区切り（`;` `&` `|` `(` 改行、または先頭）から `start` までの部分。 */
function precedingText(command: string, start: number): string {
  let index = start
  while (index > 0 && !isCommandBoundary(command[index - 1])) {
    index -= 1
  }
  return command.slice(index, start).trim()
}

function isCommandBoundary(character: string | undefined): boolean {
  return character !== undefined && ";&|(\n".includes(character)
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

  const rawCommand = input.tool_input?.command
  return typeof rawCommand === "string" ? rawCommand : undefined
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
