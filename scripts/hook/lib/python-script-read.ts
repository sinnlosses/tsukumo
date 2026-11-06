// コマンドが走らせる `python3 <path>.py` のスクリプトのファイルを、判定にかけるために読む。

import { existsSync, readFileSync, statSync } from "node:fs"
import { dirname, join } from "node:path"

import { findQuotedSpans, withSpansBlanked, type QuotedSpan } from "./quoted-span.ts"
import { parseShellCommand } from "./shell-command.ts"
import {
  absoluteScriptPath,
  directoryAfter,
  directoryAfterUnsure,
  directoryOfCwd,
  isOutside,
  startDirectory,
  type WorkingDirectory,
} from "./working-directory.ts"

/**
 * コマンドの位置の `python` にスクリプトのファイルが続く形。
 * 1つ目の捕獲が前置き（`python` の位置を出すため）、2つ目が引用符、3つ目がパス。
 */
const PYTHON_SCRIPT_FILE =
  /((?:^|[;&|(]\s*|\n)\s*(?:\S+=\S+\s+)*)(?:\S*\/)?python3?(?:\.\d+)?(?:\s+-[abBdEhiIOPqsSuvVxX]+)*\s+(["']?)([^\s"'$`;&|<>()~*?]+\.py)\2(?=\s|$|[;&|)])/g

/** `&&` でも `;` でも改行でもない区切り（サブシェル・単独の `&`・`|`・`||`）。 */
const NON_SEQUENTIAL_SEPARATOR = /[()|]|(?<!&)&(?!&)/

/** リダイレクトの `2>&1`・`&>` の `&`（区切りではない）。 */
const FILE_DESCRIPTOR_AMPERSAND = /\d*[<>]&|&>>?/g

/** 読んで判定にかけるスクリプトのファイルの大きさの上限（バイト）。 */
const SCRIPT_SIZE_LIMIT = 1024 * 1024

/** 読んだスクリプトのファイル。`foreign` は、別の git 作業ツリーの中にあり、作業ツリーの外のディレクトリで走らせるもの。 */
export type PythonScript = { readonly text: string; readonly foreign: boolean }

/** コマンドが走らせる `python3 <path>.py` のうち、読めるファイルの中身。読めないものは含めない。 */
export function readPythonScripts(
  command: string,
  cwd?: string,
  workRoot?: string,
): readonly PythonScript[] {
  const runDirectories =
    workRoot === undefined
      ? undefined
      : scriptRunDirectories(command, startDirectory(cwd ?? workRoot, workRoot))
  return findPythonScriptPaths(command, findQuotedSpans(command)).flatMap((path) => {
    const directories = runDirectories?.get(path) ?? []
    const [runDirectory] = directories
    const resolvedFrom =
      runDirectory?.kind === "known" &&
      directories.every(
        (directory) => directory.kind === "known" && directory.path === runDirectory.path,
      ) &&
      (cwd !== undefined || runDirectory.path !== workRoot)
        ? runDirectory
        : directoryOfCwd(cwd)
    const absolute = absoluteScriptPath(path, resolvedFrom)
    const text = absolute === undefined ? undefined : readTextFile(absolute)
    if (absolute === undefined || text === undefined) {
      return []
    }
    const foreign =
      workRoot !== undefined &&
      directories.length > 0 &&
      directories.every(
        (directory) => directory.kind === "known" && isOutside(directory.path, workRoot),
      ) &&
      isInForeignGitTree(absolute, workRoot)
    return [{ text, foreign }]
  })
}

/** スクリプトのファイルの中身。読めなければ `undefined`。 */
export function readScriptFile(path: string, directory: WorkingDirectory): string | undefined {
  const absolute = absoluteScriptPath(path, directory)
  return absolute === undefined ? undefined : readTextFile(absolute)
}

/**
 * 単純コマンドの引数に現れた `.py` の語ごとに、そのコマンドを走らせる作業ディレクトリ。
 * `cd` が次のコマンドへ効くと読むのは、区切りが `&&`・`;`・改行だけのとき。
 * サブシェル・`&`・`|`・`||` を含むコマンドでは、`cd` のあとの作業ディレクトリを決まらないものにする。
 */
function scriptRunDirectories(
  command: string,
  start: WorkingDirectory,
): ReadonlyMap<string, readonly WorkingDirectory[]> {
  const skeleton = withSpansBlanked(command, findQuotedSpans(command)).replace(
    FILE_DESCRIPTOR_AMPERSAND,
    "",
  )
  const followsCd = !NON_SEQUENTIAL_SEPARATOR.test(skeleton)
  const directories = new Map<string, WorkingDirectory[]>()
  let directory = start
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
  const paths = [...command.matchAll(PYTHON_SCRIPT_FILE)].flatMap((match) => {
    const pythonStart = match.index + (match[1] ?? "").length
    const path = match[3]
    return path !== undefined &&
      !spans.some((span) => span.start <= pythonStart && pythonStart < span.end)
      ? [path]
      : []
  })
  return [...new Set(paths)]
}
