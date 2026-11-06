// 作業ツリーの中のファイルへ書き込む Bash のコマンドの判定。
// 当たるのは、書き先が作業ツリーの中にある（または展開しないと決まらない）
// `sed -i`・`perl -i`、書き込みのリダイレクト・`tee`、作業ツリーの外からの `cp` / `mv`（画像のみは通す）、
// Python と node のコード（`-c` / `-e`・heredoc・作業ツリーの外のスクリプトのファイル）での書き込み。
// 書き先が作業ツリーの外と決まるものは当たらない。
// `pnpm`・`git`・作業ツリーの中のスクリプトは、ツールの中で書くので判定にかけない。

import { statSync } from "node:fs"
import { extname, isAbsolute } from "node:path"

import { readPythonScripts, readScriptFile, type PythonScript } from "./python-script-read.ts"
import { findQuotedSpans, type QuotedSpan } from "./quoted-span.ts"
import { parseShellCommand, type ShellWord, type SimpleCommand } from "./shell-command.ts"
import {
  absoluteScriptPath,
  directoryAfter,
  isOutside,
  locatePath,
  startDirectory,
  type WorkingDirectory,
} from "./working-directory.ts"
import { writeRuleFor, type Location } from "./write-rule-key.ts"

/**
 * in-place で書き換える `sed` / `perl` の引数の形。
 * `inPlace` は in-place の引数（`-i`・`-i.bak`・`-ni`・`-pi`・`--in-place`）、
 * `scriptOption` は次の語をスクリプトとして取る引数（`-e`・`-pe`・`-f`）、
 * `scriptAssignment` はスクリプトを `=` でつなぐ引数。
 */
const SED_OPTIONS = {
  inPlace: /^(?:-[a-zA-Z0-9]*i|--in-place)/,
  scriptOption: /^(?:-[a-zA-Z0-9]*[ef]|--expression|--file)$/,
  scriptAssignment: /^--(?:expression|file)=/,
} satisfies Record<string, RegExp>

const PERL_OPTIONS = {
  inPlace: /^-[a-zA-Z0-9]*i[a-zA-Z0-9.]*$/,
  scriptOption: /^-[a-zA-Z0-9]*[eE]$/,
  scriptAssignment: /(?!)/,
} satisfies Record<string, RegExp>

type InPlaceOptions = typeof SED_OPTIONS

/** 書き込み先が作業ツリーの中でも、Edit・Write では作れない画像として通す拡張子。 */
const BINARY_EXTENSIONS: ReadonlySet<string> = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".avif",
  ".ico",
])

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

const TARGET_DIRECTORY_OPTION = "--target-directory="

/** 当たった規則のキー。当たらなければ `undefined`。`cwd` は入力の作業ディレクトリ、`workRoot` は作業ツリーの根。 */
export function findDeniedBashRule(
  command: string,
  cwd?: string,
  workRoot?: string,
): string | undefined {
  return (
    findDeniedCommandRule(command, workRoot, readPythonScripts(command, cwd, workRoot)) ??
    (workRoot === undefined
      ? undefined
      : findWorkTreeWriteRule(command, startDirectory(cwd ?? workRoot, workRoot), workRoot))
  )
}

/** 引用符・heredoc・スクリプトのファイルの中で Python がファイルへ書き戻すコードを持つかを見て、当たれば規則のキーを返す。 */
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
  return undefined
}

/**
 * 単純コマンドを順に見て、作業ツリーの中（または書き先が決まらないところ）へ書くものの規則のキー。
 * 相対パスは `cd` を追って解く。
 */
function findWorkTreeWriteRule(
  command: string,
  start: WorkingDirectory,
  workRoot: string,
): string | undefined {
  let directory = start
  for (const simple of parseShellCommand(command)) {
    const rule = writeRuleOf(simple, directory, workRoot)
    if (rule !== undefined) {
      return rule
    }
    directory = directoryAfter(simple, directory)
  }
  return undefined
}

function writeRuleOf(
  simple: SimpleCommand,
  directory: WorkingDirectory,
  workRoot: string,
): string | undefined {
  const locate = (word: ShellWord): Location => locatePath(word, directory, workRoot)
  const name = simple.argv[0] === undefined ? "" : baseName(simple.argv[0].text)
  const args = simple.argv.slice(1)

  if (name !== "[[") {
    const redirect = writeRuleFor("redirect-write", simple.writes.map(locate))
    if (redirect !== undefined) {
      return redirect
    }
  }
  switch (name) {
    case "sed":
      return writes(editsInPlace(args, SED_OPTIONS, locate), "sed-in-place")
    case "perl":
      return writes(editsInPlace(args, PERL_OPTIONS, locate), "perl-in-place")
    case "xargs":
      return xargsInPlaceRule(args)
    case "tee":
      return writeRuleFor("tee-write", operands(args).map(locate))
    case "cp":
    case "mv":
      return writeRuleFor("copy-write", copiesIntoWorkTree(args, locate, directory))
    case "node":
      return writes(
        nodeCodes(args, simple, locate, directory).some((code) =>
          hasUnsafeWrite(code, NODE_WRITES, workRoot),
        ),
        "node-write",
      )
    default:
      return undefined
  }
}

/** in-place の引数があり、書き換えるファイルのどれかが作業ツリーの外でないか。 */
function editsInPlace(
  args: readonly ShellWord[],
  options: InPlaceOptions,
  locate: (word: ShellWord) => Location,
): boolean {
  if (!args.some((word) => options.inPlace.test(word.text))) {
    return false
  }
  return inPlaceTargets(args, options).some((word) => locate(word) !== "outside")
}

function writes(denied: boolean, rule: string): string | undefined {
  return denied ? rule : undefined
}
/** `sed` / `perl` の引数のうち、書き換えるファイル。スクリプトを引数で渡さないときの先頭の語はスクリプトなので除く。 */
function inPlaceTargets(args: readonly ShellWord[], options: InPlaceOptions): readonly ShellWord[] {
  const rest: ShellWord[] = []
  let hasScriptOption = false
  for (let index = 0; index < args.length; index += 1) {
    const word = args[index]
    if (word === undefined) {
      break
    }
    if (word.text === "--") {
      rest.push(...args.slice(index + 1))
      break
    }
    if (options.scriptOption.test(word.text)) {
      hasScriptOption = true
      index += 1
    } else if (options.scriptAssignment.test(word.text)) {
      hasScriptOption = true
    } else if (!word.text.startsWith("-") && word.text !== "") {
      rest.push(word)
    }
  }
  return hasScriptOption ? rest : rest.slice(1)
}

/** `xargs` が `sed` / `perl` を in-place で走らせる形の規則のキー。書き換えるファイルは標準入力から来るので決まらない。 */
function xargsInPlaceRule(args: readonly ShellWord[]): string | undefined {
  const commandAt = args.findIndex((word) => ["sed", "perl"].includes(baseName(word.text)))
  const command = args[commandAt]
  if (command === undefined) {
    return undefined
  }
  const isSed = baseName(command.text) === "sed"
  const options = isSed ? SED_OPTIONS : PERL_OPTIONS
  const rule = isSed ? "sed-in-place" : "perl-in-place"
  return args.slice(commandAt + 1).some((word) => options.inPlace.test(word.text))
    ? rule
    : undefined
}

/** `cp` / `mv` が、移す元のどれかが作業ツリーの中と決まらず画像のみでもないとき、書き先の位置。当たらなければ空。 */
function copiesIntoWorkTree(
  args: readonly ShellWord[],
  locate: (word: ShellWord) => Location,
  directory: WorkingDirectory,
): readonly Location[] {
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
    return []
  }
  const placesImages =
    sources.every(isBinaryFile) &&
    (targetDirectory !== undefined ||
      isDirectory(destination, directory) ||
      isBinaryFile(destination))
  return !placesImages && sources.some((word) => locate(word) !== "inside")
    ? [locate(destination)]
    : []
}

function isBinaryFile(word: ShellWord): boolean {
  return BINARY_EXTENSIONS.has(extname(word.text).toLowerCase())
}

/** 末尾が `/` か、`cd` を追って解いたパスが実在するディレクトリか。 */
function isDirectory(word: ShellWord, directory: WorkingDirectory): boolean {
  if (word.expanded) {
    return false
  }
  if (word.text.endsWith("/")) {
    return true
  }
  const absolute = absoluteScriptPath(word.text, directory)
  try {
    return absolute !== undefined && statSync(absolute).isDirectory()
  } catch {
    return false
  }
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
  directory: WorkingDirectory,
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

function readScriptAt(word: ShellWord, directory: WorkingDirectory): readonly string[] {
  if (word.expanded) {
    return []
  }
  const text = readScriptFile(word.text, directory)
  return text === undefined ? [] : [text]
}

/** Python のコードが、書き込み先を作業ツリーの外のリテラルと読めない書き込みを持つか。 */
function isDeniedPythonCode(code: string, workRoot?: string): boolean {
  return PYTHON_OTHER_WRITE.test(code) || hasUnsafeWrite(code, PYTHON_OPEN_WRITES, workRoot)
}

/** コードの中の書き込みの呼び出しのうち、書き込み先が作業ツリーの外のリテラルと読めないものがあるか。 */
function hasUnsafeWrite(code: string, patterns: readonly RegExp[], workRoot?: string): boolean {
  return patterns.some((pattern) =>
    [...code.matchAll(pattern)].some(
      (match) => !isLiteralOutsideWorkTree(match[1] ?? "", workRoot),
    ),
  )
}

/** 書き込みの呼び出しの書き込み先が、作業ツリーの外を指す絶対パスの文字列リテラルか。 */
function isLiteralOutsideWorkTree(target: string, workRoot?: string): boolean {
  const path = PLAIN_STRING_LITERAL.exec(target.trim())?.[2]
  if (path === undefined || workRoot === undefined) {
    return false
  }
  if (!isAbsolute(path) || path.split("/").includes("..")) {
    return false
  }
  return isOutside(path, workRoot)
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
  while (index > 0 && !isCommandBoundary(command.charAt(index - 1))) {
    index -= 1
  }
  return command.slice(index, start).trim()
}

function isCommandBoundary(character: string): boolean {
  return ";&|(\n".includes(character)
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1)
}
