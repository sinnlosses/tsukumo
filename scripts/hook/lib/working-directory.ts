// シェルのコマンド列を順に見るあいだの作業ディレクトリ。
// `cd` を追えて決まっているか、追えず決まらないかを判別して運ぶ。

import { isAbsolute, relative, resolve } from "node:path"

import type { ShellWord, SimpleCommand } from "./shell-command.ts"
import type { Location } from "./write-rule-key.ts"

export type WorkingDirectory =
  | { readonly kind: "known"; readonly path: string }
  | { readonly kind: "unknown" }

const UNKNOWN_DIRECTORY: WorkingDirectory = { kind: "unknown" }

/** 入力の `cwd`（無いこともある）を作業ディレクトリにする。 */
export function directoryOfCwd(cwd?: string): WorkingDirectory {
  return cwd === undefined ? UNKNOWN_DIRECTORY : knownDirectory(cwd)
}

/** 入力の `cwd`（絶対パスのとき）、そうでなければ作業ツリーの根。 */
export function startDirectory(cwd: string, workRoot: string): WorkingDirectory {
  return knownDirectory(isAbsolute(cwd) ? cwd : workRoot)
}

/** 単純コマンドを実行したあとの作業ディレクトリ。 */
export function directoryAfter(
  simple: SimpleCommand,
  directory: WorkingDirectory,
): WorkingDirectory {
  const name = simple.argv[0]?.text
  if (name === "popd") {
    return UNKNOWN_DIRECTORY
  }
  if (name !== "cd" && name !== "pushd") {
    return directory
  }
  const [target, ...extra] = simple.argv.slice(1).filter((word) => !/^-[LPe@]+$/.test(word.text))
  if (target === undefined || extra.length > 0 || target.expanded || target.text === "-") {
    return UNKNOWN_DIRECTORY
  }
  if (isAbsolute(target.text)) {
    return knownDirectory(resolve(target.text))
  }
  return directory.kind === "known"
    ? knownDirectory(resolve(directory.path, target.text))
    : UNKNOWN_DIRECTORY
}

/** `cd` が次のコマンドへ効くと読めないとき: `cd` 系なら決まらない、そうでなければ変わらない。 */
export function directoryAfterUnsure(
  simple: SimpleCommand,
  directory: WorkingDirectory,
): WorkingDirectory {
  const name = simple.argv[0]?.text
  return name !== undefined && ["cd", "pushd", "popd"].includes(name)
    ? UNKNOWN_DIRECTORY
    : directory
}

export function locatePath(
  word: ShellWord,
  directory: WorkingDirectory,
  workRoot: string,
): Location {
  if (word.expanded || word.text === "") {
    return "unknown"
  }
  let absolute: string
  if (isAbsolute(word.text)) {
    absolute = resolve(word.text)
  } else if (directory.kind === "known") {
    absolute = resolve(directory.path, word.text)
  } else {
    return "unknown"
  }
  if (absolute.startsWith("/dev/")) {
    return "outside"
  }
  return isOutside(absolute, workRoot) ? "outside" : "inside"
}

/** 絶対パスはそのまま、相対パスは絶対パスの作業ディレクトリから解く。解けなければ `undefined`。 */
export function absoluteScriptPath(path: string, directory: WorkingDirectory): string | undefined {
  if (isAbsolute(path)) {
    return path
  }
  return directory.kind === "known" && isAbsolute(directory.path)
    ? resolve(directory.path, path)
    : undefined
}

export function isOutside(path: string, workRoot: string): boolean {
  const fromRoot = relative(workRoot, path)
  return fromRoot === ".." || fromRoot.startsWith("../") || isAbsolute(fromRoot)
}

function knownDirectory(path: string): WorkingDirectory {
  return { kind: "known", path }
}
