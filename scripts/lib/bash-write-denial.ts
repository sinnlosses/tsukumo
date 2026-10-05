// 作業ツリーの中のファイルへ書き込む Bash のコマンドの判定。
// 当たるのは `sed -i`・`perl -i`、書き込みのリダイレクト・`tee`、作業ツリーの外からの `cp` / `mv`、
// Python と node のコード（`-c` / `-e`・heredoc・作業ツリーの外のスクリプトのファイル）での書き込み。
// `pnpm`・`git`・作業ツリーの中のスクリプトのように、ツールの中で書くものは判定にかけない。

import { existsSync, readFileSync, statSync } from "node:fs"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"

import { findQuotedSpans, withSpansBlanked, type QuotedSpan } from "./quoted-span.ts"
import { parseShellCommand, type ShellWord, type SimpleCommand } from "./shell-command.ts"

/** コマンドの位置（`sudo` `xargs` の後ろを含む）に現れた `sed` に、in-place の引数（`-i`・`-i.bak`・`-ni`・`--in-place`）が続く形。 */
const SED_IN_PLACE =
  /(?:^|[;&|(]\s*|\n)\s*(?:(?:sudo|xargs)\s+(?:-\S+\s+)*)?sed\b[^;&|\n]*\s(?:-[a-zA-Z0-9]*i|--in-place)/

/** コマンドの位置に現れた `perl` に、in-place の引数（`-i`・`-i.bak`・`-pi` のような束ね方を含む）が続く形。 */
const PERL_IN_PLACE =
  /(?:^|[;&|(]\s*|\n)\s*(?:(?:sudo|xargs)\s+(?:-\S+\s+)*)?perl\b[^;&|\n]*\s-[a-zA-Z0-9]*i[a-zA-Z0-9]*\b/

/** Python のコードの中にある、書き込みモードの `open(...)`。第1引数を書き込み先として捕獲する。 */
const PYTHON_OPEN_WRITES = [
  /open\(([^,)]*),\s*["'][waxWAX]/g,
  /open\(([^,)]*)[^)]*mode\s*=\s*["'][waxWAX]/g,
] as const

/** Python のコードの中にある、書き込み先をコマンド文字列から読めない書き戻しの呼び出し。 */
const PYTHON_OTHER_WRITE =
  /\.write_text\(|\.write_bytes\(|shutil\.move\(|os\.rename\(|os\.replace\(/

/** node のコードの中にある、ファイルへ書く呼び出し。書き込み先の引数を捕獲する。 */
const NODE_WRITES = [
  /\b(?:writeFile|appendFile|truncate)(?:Sync)?\(([^,)]*)/g,
  /\bcreateWriteStream\(([^,)]*)/g,
  /\bopen(?:Sync)?\(([^,)]*),\s*["'`][wa]/g,
  /\b(?:copyFile|rename|cp)(?:Sync)?\([^,)]*,\s*([^,)]*)/g,
] as const

/** 展開も連結も含まない、引用符1組だけの文字列リテラル。 */
const PLAIN_STRING_LITERAL = /^(["'`])([^"'`\\$~{}]*)\1$/

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

/** node の引数のうち、値を1つ取るもの。 */
const NODE_OPTIONS_WITH_VALUE: ReadonlySet<string> = new Set([
  "-r",
  "--require",
  "--import",
  "--loader",
  "--experimental-loader",
  "-C",
  "--conditions",
])

/** node の引数のうち、次の語をコードとして実行するもの。 */
const NODE_EVAL_OPTIONS: ReadonlySet<string> = new Set(["-e", "--eval", "-p", "--print"])

/** `&&` でも `;` でも改行でもない区切り（サブシェル・単独の `&`・`|`・`||`）。 */
const NON_SEQUENTIAL_SEPARATOR = /[()|]|(?<!&)&(?!&)/

/** リダイレクトの `2>&1`・`&>` の `&`（区切りではない）。 */
const FILE_DESCRIPTOR_AMPERSAND = /\d*[<>]&|&>>?/g

const TARGET_DIRECTORY_OPTION = "--target-directory="

/** 読んで判定にかけるスクリプトのファイルの大きさの上限（バイト）。 */
const SCRIPT_SIZE_LIMIT = 1024 * 1024

/** 読んだスクリプトのファイル。`foreign` は、別の git 作業ツリーの中にあり、作業ツリーの外のディレクトリで走らせるもの。 */
type PythonScript = { readonly text: string; readonly foreign: boolean }

/** パスが作業ツリーのどちら側にあるか。`unknown` は展開や読めない `cd` で決まらないもの。 */
type Location = "inside" | "outside" | "unknown"

/** 当たった規則のキー。当たらなければ `undefined`。`cwd` は入力の作業ディレクトリ、`workRoot` は作業ツリーの根。 */
export function findDeniedBashRule(
  command: string,
  cwd: string | undefined,
  workRoot: string | undefined,
): string | undefined {
  return (
    findDeniedCommandRule(command, workRoot, readPythonScripts(command, cwd, workRoot)) ??
    (workRoot !== undefined && writesIntoWorkTree(command, startDirectory(cwd, workRoot), workRoot)
      ? "worktree-write"
      : undefined)
  )
}

/** コマンドが `sed -i`・`perl -pi` 等の構造に当たるか、引用符・heredoc・スクリプトのファイルの中で Python がファイルへ書き戻すコードを持つかを見て、当たった規則のキーを返す。 */
function findDeniedCommandRule(
  command: string,
  workRoot: string | undefined,
  scripts: readonly PythonScript[],
): string | undefined {
  const spans = findQuotedSpans(command)
  if (
    spans.some(
      (span) => isExecutedPythonCode(command, span) && isDeniedPythonCode(span.content, workRoot),
    ) ||
    scripts.some((script) =>
      script.foreign && workRoot !== undefined
        ? script.text.includes(workRoot)
        : isDeniedPythonCode(script.text, workRoot),
    )
  ) {
    return "python-write"
  }

  const skeleton = withSpansBlanked(command, spans)
  if (SED_IN_PLACE.test(skeleton)) {
    return "sed-in-place"
  }
  return PERL_IN_PLACE.test(skeleton) ? "perl-in-place" : undefined
}

/**
 * 単純コマンドを順に見て、作業ツリーの中（または書き先が決まらないところ）へ書くものがあるか。
 * 相対パスは `cd` を追って解く。
 */
function writesIntoWorkTree(command: string, start: string, workRoot: string): boolean {
  let directory: string | undefined = start
  for (const simple of parseShellCommand(command)) {
    if (writesInto(simple, directory, workRoot)) {
      return true
    }
    directory = directoryAfter(simple, directory)
  }
  return false
}

function writesInto(
  simple: SimpleCommand,
  directory: string | undefined,
  workRoot: string,
): boolean {
  const locate = (word: ShellWord): Location => locatePath(word, directory, workRoot)
  const name = simple.argv[0] === undefined ? "" : baseName(simple.argv[0].text)
  const args = simple.argv.slice(1)

  if (name !== "[[" && simple.writes.some((word) => locate(word) !== "outside")) {
    return true
  }
  switch (name) {
    case "tee":
      return operands(args).some((word) => locate(word) !== "outside")
    case "cp":
    case "mv":
      return copiesIntoWorkTree(args, locate)
    case "node":
      return nodeCodes(args, simple, locate, directory).some((code) =>
        hasUnsafeWrite(code, NODE_WRITES, workRoot),
      )
    default:
      return false
  }
}

/** `cp` / `mv` の書き先が作業ツリーの外でなく、移す元のどれかが作業ツリーの中と決まっていないか。 */
function copiesIntoWorkTree(
  args: readonly ShellWord[],
  locate: (word: ShellWord) => Location,
): boolean {
  const flagAt = args.findIndex((word) => word.text === "-t")
  const option = args.find((word) => word.text.startsWith(TARGET_DIRECTORY_OPTION))
  const targetDirectory =
    option !== undefined
      ? { ...option, text: option.text.slice(TARGET_DIRECTORY_OPTION.length) }
      : flagAt === -1
        ? undefined
        : args[flagAt + 1]
  const paths = operands(
    flagAt === -1 ? args : [...args.slice(0, flagAt), ...args.slice(flagAt + 2)],
  )
  const destination = targetDirectory ?? paths.at(-1)
  const sources = targetDirectory === undefined ? paths.slice(0, -1) : paths
  if (destination === undefined || sources.length === 0) {
    return false
  }
  return locate(destination) !== "outside" && sources.some((word) => locate(word) !== "inside")
}

/** 引数のうち、`-` で始まる引数を除いたもの（`--` の後ろはすべて）。 */
function operands(args: readonly ShellWord[]): readonly ShellWord[] {
  const endAt = args.findIndex((word) => word.text === "--")
  const options = endAt === -1 ? args : args.slice(0, endAt)
  const rest = endAt === -1 ? [] : args.slice(endAt + 1)
  return [...options.filter((word) => !word.text.startsWith("-") || word.text === "-"), ...rest]
}

/**
 * node が実行するコードのうち、読めるもの。
 * `-e` / `-p` の語、作業ツリーの外のスクリプトのファイル、標準入力へ渡す heredoc と `<` のファイル。
 * 作業ツリーの中のスクリプトのファイルは読まない。
 */
function nodeCodes(
  args: readonly ShellWord[],
  simple: SimpleCommand,
  locate: (word: ShellWord) => Location,
  directory: string | undefined,
): readonly string[] {
  let index = 0
  while (index < args.length) {
    const word = args[index]
    if (word === undefined) {
      break
    }
    if (NODE_EVAL_OPTIONS.has(word.text)) {
      const code = args[index + 1]
      return code === undefined ? [] : [code.text]
    }
    if (word.text.startsWith("--eval=") || word.text.startsWith("--print=")) {
      return [word.text.slice(word.text.indexOf("=") + 1)]
    }
    if (word.text === "-") {
      break
    }
    if (!word.text.startsWith("-")) {
      return locate(word) === "outside" ? readScriptAt(word, directory) : []
    }
    index += NODE_OPTIONS_WITH_VALUE.has(word.text) ? 2 : 1
  }
  return [...simple.stdinTexts, ...simple.inputs.flatMap((word) => readScriptAt(word, directory))]
}

function readScriptAt(word: ShellWord, directory: string | undefined): readonly string[] {
  if (word.expanded) {
    return []
  }
  const text = readScriptFile(word.text, directory)
  return text === undefined ? [] : [text]
}

/** 単純コマンドを実行したあとの作業ディレクトリ。決まらなければ `undefined`。 */
function directoryAfter(simple: SimpleCommand, directory: string | undefined): string | undefined {
  const name = simple.argv[0]?.text
  if (name === "popd") {
    return undefined
  }
  if (name !== "cd" && name !== "pushd") {
    return directory
  }
  const [target, ...extra] = simple.argv.slice(1).filter((word) => !/^-[LPe@]+$/.test(word.text))
  if (target === undefined || extra.length > 0 || target.expanded || target.text === "-") {
    return undefined
  }
  if (isAbsolute(target.text)) {
    return resolve(target.text)
  }
  return directory === undefined ? undefined : resolve(directory, target.text)
}

/** 単純コマンドが `cd` 系なら決まらない、そうでなければ変わらない作業ディレクトリ。 */
function directoryAfterUnsure(
  simple: SimpleCommand,
  directory: string | undefined,
): string | undefined {
  return ["cd", "pushd", "popd"].includes(simple.argv[0]?.text ?? "") ? undefined : directory
}

function locatePath(word: ShellWord, directory: string | undefined, workRoot: string): Location {
  if (word.expanded || word.text === "") {
    return "unknown"
  }
  const absolute = isAbsolute(word.text)
    ? resolve(word.text)
    : directory === undefined
      ? undefined
      : resolve(directory, word.text)
  if (absolute === undefined) {
    return "unknown"
  }
  if (absolute.startsWith("/dev/")) {
    return "outside"
  }
  return isOutside(absolute, workRoot) ? "outside" : "inside"
}

/** 入力の `cwd`（絶対パスのとき）、無ければ作業ツリーの根。 */
function startDirectory(cwd: string | undefined, workRoot: string): string {
  return cwd !== undefined && isAbsolute(cwd) ? cwd : workRoot
}

/** Python のコードが、書き込み先を作業ツリーの外のリテラルと読めない書き込みを持つか。 */
function isDeniedPythonCode(code: string, workRoot: string | undefined): boolean {
  return PYTHON_OTHER_WRITE.test(code) || hasUnsafeWrite(code, PYTHON_OPEN_WRITES, workRoot)
}

/** コードの中の書き込みの呼び出しのうち、書き込み先が作業ツリーの外のリテラルと読めないものがあるか。 */
function hasUnsafeWrite(
  code: string,
  patterns: readonly RegExp[],
  workRoot: string | undefined,
): boolean {
  return patterns.some((pattern) =>
    [...code.matchAll(pattern)].some(
      (match) => !isLiteralOutsideWorkTree(match[1] ?? "", workRoot),
    ),
  )
}

/** 書き込みの呼び出しの書き込み先が、作業ツリーの外を指す絶対パスの文字列リテラルか。 */
function isLiteralOutsideWorkTree(target: string, workRoot: string | undefined): boolean {
  const path = PLAIN_STRING_LITERAL.exec(target.trim())?.[2]
  if (path === undefined || workRoot === undefined) {
    return false
  }
  if (!isAbsolute(path) || path.split("/").includes("..")) {
    return false
  }
  return isOutside(path, workRoot)
}

function isOutside(path: string, workRoot: string): boolean {
  const fromRoot = relative(workRoot, path)
  return fromRoot === ".." || fromRoot.startsWith("../") || isAbsolute(fromRoot)
}

/** コマンドが走らせる `python3 <path>.py` のうち、読めるファイルの中身。読めないものは含めない。 */
function readPythonScripts(
  command: string,
  cwd: string | undefined,
  workRoot: string | undefined,
): readonly PythonScript[] {
  const runDirectories =
    workRoot === undefined
      ? undefined
      : scriptRunDirectories(command, startDirectory(cwd, workRoot))
  return findPythonScriptPaths(command, findQuotedSpans(command)).flatMap((path) => {
    const directories = runDirectories?.get(path) ?? []
    const [runDirectory] = directories
    const resolvesFromRunDirectory =
      runDirectory !== undefined &&
      directories.every((directory) => directory === runDirectory) &&
      (cwd !== undefined || runDirectory !== workRoot)
    const absolute = absoluteScriptPath(path, resolvesFromRunDirectory ? runDirectory : cwd)
    const text = absolute === undefined ? undefined : readTextFile(absolute)
    if (absolute === undefined || text === undefined) {
      return []
    }
    const foreign =
      workRoot !== undefined &&
      directories.length > 0 &&
      directories.every((directory) => directory !== undefined && isOutside(directory, workRoot)) &&
      isInForeignGitTree(absolute, workRoot)
    return [{ text, foreign }]
  })
}

/**
 * 単純コマンドの引数に現れた `.py` の語ごとに、そのコマンドを走らせる作業ディレクトリ（決まらなければ `undefined`）。
 * `cd` が次のコマンドへ効くと読むのは、区切りが `&&`・`;`・改行だけのとき。
 * サブシェル・`&`・`|`・`||` を含むコマンドでは、`cd` のあとの作業ディレクトリを決まらないものにする。
 */
function scriptRunDirectories(
  command: string,
  start: string,
): ReadonlyMap<string, readonly (string | undefined)[]> {
  const skeleton = withSpansBlanked(command, findQuotedSpans(command)).replace(
    FILE_DESCRIPTOR_AMPERSAND,
    "",
  )
  const followsCd = !NON_SEQUENTIAL_SEPARATOR.test(skeleton)
  const directories = new Map<string, (string | undefined)[]>()
  let directory: string | undefined = start
  for (const simple of parseShellCommand(command)) {
    for (const word of simple.argv.slice(1)) {
      if (word.text.endsWith(".py")) {
        directories.set(word.text, [...(directories.get(word.text) ?? []), directory])
      }
    }
    directory = followsCd
      ? directoryAfter(simple, directory)
      : directoryAfterUnsure(simple, directory)
  }
  return directories
}

function readScriptFile(path: string, cwd: string | undefined): string | undefined {
  const absolute = absoluteScriptPath(path, cwd)
  return absolute === undefined ? undefined : readTextFile(absolute)
}

function absoluteScriptPath(path: string, cwd: string | undefined): string | undefined {
  if (isAbsolute(path)) {
    return path
  }
  return cwd !== undefined && isAbsolute(cwd) ? resolve(cwd, path) : undefined
}

function readTextFile(absolute: string): string | undefined {
  try {
    const stat = statSync(absolute)
    return stat.isFile() && stat.size <= SCRIPT_SIZE_LIMIT
      ? readFileSync(absolute, "utf8")
      : undefined
  } catch {
    return undefined
  }
}

/** スクリプトを含む git 作業ツリーの根が見つかり、その作業ツリーが `workRoot` を含まないか。 */
function isInForeignGitTree(script: string, workRoot: string): boolean {
  for (let directory = dirname(script); ; directory = dirname(directory)) {
    if (existsSync(join(directory, ".git"))) {
      return isOutside(workRoot, directory) && isOutside(script, workRoot)
    }
    if (dirname(directory) === directory) {
      return false
    }
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

function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1)
}
