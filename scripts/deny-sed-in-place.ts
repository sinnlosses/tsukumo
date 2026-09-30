// ファイルを書き換える `sed -i`・`perl -pi` / `perl -i`・Python の書き込みを、実行される前に止める
// Claude Code の PreToolUse hook（`.claude/settings.json` から Bash ツールに掛かる）。
// 書き換えは Edit ツールで行う。
//
// 終了コード 2 で Bash の実行を止め、stderr の中身がモデルへ返る。
// それ以外の終了コードでは実行を止めない（判定に失敗したときは通す）。

import { readFileSync, statSync } from "node:fs"
import { isAbsolute, relative, resolve } from "node:path"
import process from "node:process"

import { findQuotedSpans, withSpansBlanked, type QuotedSpan } from "./lib/quoted-span.ts"

/** コマンドの位置（`sudo` `xargs` の後ろを含む）に現れた `sed` に、in-place の引数（`-i`・`-i.bak`・`-ni`・`--in-place`）が続く形。 */
const SED_IN_PLACE =
  /(?:^|[;&|(]\s*|\n)\s*(?:(?:sudo|xargs)\s+(?:-\S+\s+)*)?sed\b[^;&|\n]*\s(?:-[a-zA-Z]*i|--in-place)/

/** コマンドの位置に現れた `perl` に、in-place の引数（`-i`・`-i.bak`・`-pi` のような束ね方を含む）が続く形。 */
const PERL_IN_PLACE =
  /(?:^|[;&|(]\s*|\n)\s*(?:(?:sudo|xargs)\s+(?:-\S+\s+)*)?perl\b[^;&|\n]*\s-[a-zA-Z]*i[a-zA-Z]*\b/

/** Python のコードの中にある、書き込みモードの `open(...)`。第1引数を書き込み先として捕獲する。 */
const PYTHON_OPEN_WRITES = [
  /open\(([^,)]*),\s*["'][waxWAX]/g,
  /open\(([^,)]*)[^)]*mode\s*=\s*["'][waxWAX]/g,
] as const

/** Python のコードの中にある、書き込み先をコマンド文字列から読めない書き戻しの呼び出し。 */
const PYTHON_OTHER_WRITE =
  /\.write_text\(|\.write_bytes\(|shutil\.move\(|os\.rename\(|os\.replace\(/

/** 展開も連結も含まない、引用符1組だけの文字列リテラル。 */
const PLAIN_STRING_LITERAL = /^(["'])([^"'\\$~{}]*)\1$/

/** heredoc の直前のコマンド語が、素の `python3`（引数無しまたは `-` のみ）である形。この heredoc の本文はコードとして実行される。 */
const PYTHON_HEREDOC_SCRIPT = /(?:^|[\s;&|(])(?:\S+=\S+\s+)*python3?(\s+-)?\s*$/

/** 引用符の直前が `python3 ... -c` である形。この引用符の中身はコードとして実行される。 */
const PYTHON_DASH_C_SCRIPT = /(?:^|[\s;&|(])(?:\S+=\S+\s+)*python3?\s+(?:-\S+\s+)*-c\s*$/

/**
 * コマンドの位置の `python` にスクリプトのファイルが続く形。
 * 1つ目の捕獲が前置き（`python` の位置を出すため）、2つ目が引用符、3つ目がパス。
 */
const PYTHON_SCRIPT_FILE =
  /((?:^|[;&|(]\s*|\n)\s*(?:\S+=\S+\s+)*)(?:\S*\/)?python3?(?:\.\d+)?(?:\s+-[abBdEhiIOPqsSuvVxX]+)*\s+(["']?)([^\s"'$`;&|<>()~*?]+\.py)\2(?=\s|$|[;&|)])/g

/** 読んで判定にかけるスクリプトのファイルの大きさの上限（バイト）。 */
const SCRIPT_SIZE_LIMIT = 1024 * 1024

const REFUSAL = `Bash の \`sed -i\`・\`perl -pi\` / \`perl -i\`・Python の書き込みでファイルを書き換えない。
BSD と GNU で引数が違い、置換の当たりも確かめられない。
ファイルの書き換えは Edit ツール（複数箇所なら replace_all）か Write ツールで行うこと。
作業ツリーの外の下書き（\`tw edit --body-file\` に渡す本文など）は Write ツールでスクラッチに書くか、heredoc を標準入力へ直接渡す。
Python で書くなら、書き込み先を \`open("/絶対パス", "w")\` のリテラルにして作業ツリーの外に置けば通る。
スクリプトをファイルに書いて \`python3 <file>.py\` で走らせても、中身が同じ判定にかかる。
読むだけなら \`sed -n '1,5p' <file>\` は使える。`

/** Bash ツールの入力のうち、この hook が見るところ。 */
type BashHookInput = {
  readonly tool_name?: unknown
  readonly tool_input?: { readonly command?: unknown }
  readonly cwd?: unknown
}

type BashInput = {
  readonly command: string
  readonly cwd: string | undefined
}

const raw = await readStdin()
const bashInput = readBashInput(raw)
if (
  bashInput !== undefined &&
  isDeniedCommand(
    bashInput.command,
    readWorkRoot(bashInput.cwd),
    readPythonScripts(bashInput.command, bashInput.cwd),
  )
) {
  process.stderr.write(`${REFUSAL}\n`)
  process.exit(2)
}

/** コマンドが `sed -i`・`perl -pi` 等の構造に当たるか、引用符・heredoc・スクリプトのファイルの中で Python がファイルへ書き戻すコードを持つかを見る。 */
function isDeniedCommand(
  command: string,
  workRoot: string | undefined,
  scriptTexts: readonly string[],
): boolean {
  const spans = findQuotedSpans(command)
  if (
    spans.some(
      (span) => isExecutedPythonCode(command, span) && isDeniedPythonCode(span.content, workRoot),
    ) ||
    scriptTexts.some((text) => isDeniedPythonCode(text, workRoot))
  ) {
    return true
  }

  const skeleton = withSpansBlanked(command, spans)
  return SED_IN_PLACE.test(skeleton) || PERL_IN_PLACE.test(skeleton)
}

/** Python のコードが、書き込み先を作業ツリーの外のリテラルと読めない書き込みを持つか。 */
function isDeniedPythonCode(code: string, workRoot: string | undefined): boolean {
  if (PYTHON_OTHER_WRITE.test(code)) {
    return true
  }

  return PYTHON_OPEN_WRITES.some((pattern) =>
    [...code.matchAll(pattern)].some(
      (match) => !isLiteralOutsideWorkTree(match[1] ?? "", workRoot),
    ),
  )
}

/** `open` の第1引数が、作業ツリーの外を指す絶対パスの文字列リテラルか。 */
function isLiteralOutsideWorkTree(target: string, workRoot: string | undefined): boolean {
  const path = PLAIN_STRING_LITERAL.exec(target.trim())?.[2]
  if (path === undefined || workRoot === undefined) {
    return false
  }
  if (!isAbsolute(path) || path.split("/").includes("..")) {
    return false
  }

  const fromRoot = relative(workRoot, path)
  return fromRoot === ".." || fromRoot.startsWith("../") || isAbsolute(fromRoot)
}

/** 作業ツリーの根。`CLAUDE_PROJECT_DIR`、無ければ hook の入力の `cwd`。絶対パスでなければ `undefined`。 */
function readWorkRoot(cwd: string | undefined): string | undefined {
  const candidate = process.env["CLAUDE_PROJECT_DIR"] || cwd
  return candidate !== undefined && isAbsolute(candidate) ? candidate : undefined
}

/** コマンドが走らせる `python3 <path>.py` のうち、読めるファイルの中身。読めないものは含めない。 */
function readPythonScripts(command: string, cwd: string | undefined): readonly string[] {
  return findPythonScriptPaths(command, findQuotedSpans(command)).flatMap((path) => {
    const text = readScriptFile(path, cwd)
    return text === undefined ? [] : [text]
  })
}

function readScriptFile(path: string, cwd: string | undefined): string | undefined {
  const absolute = isAbsolute(path)
    ? path
    : cwd !== undefined && isAbsolute(cwd)
      ? resolve(cwd, path)
      : undefined
  if (absolute === undefined) {
    return undefined
  }

  try {
    const stat = statSync(absolute)
    return stat.isFile() && stat.size <= SCRIPT_SIZE_LIMIT
      ? readFileSync(absolute, "utf8")
      : undefined
  } catch {
    return undefined
  }
}

/** 引用符・heredoc の外に現れた `python3 <path>.py` のパス（重複なし）。 */
function findPythonScriptPaths(command: string, spans: readonly QuotedSpan[]): readonly string[] {
  const paths = [...command.matchAll(PYTHON_SCRIPT_FILE)]
    .filter((match) => {
      const pythonStart = match.index + (match[1] ?? "").length
      return !spans.some((span) => span.start <= pythonStart && pythonStart < span.end)
    })
    .map((match) => match[3] ?? "")
  return [...new Set(paths)]
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

  return { command: rawCommand, cwd: typeof input.cwd === "string" ? input.cwd : undefined }
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
