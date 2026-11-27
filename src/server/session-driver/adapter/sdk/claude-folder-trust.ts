// 作業ディレクトリを Claude Code が信頼しているか（利用者がそのフォルダの信頼の確認に答えたか）を、Claude Code 自身の控え（`CLAUDE_CONFIG_DIR`、無ければ `~` の `.claude.json` の `projects`）から読む口。
// 控えから見るのは各フォルダの `hasTrustDialogAccepted` だけで、ほかの欄は戻り値に乗らない。
//
// どのフォルダの控えを数えるかは、Claude Code が信頼を判じる範囲に合わせ、迷うところは狭いほうに倒す。
// git の作業ツリーの中なら、作業ディレクトリからその作業ツリーの根までと、本体の根（別の作業ツリーなら本体のチェックアウト、bare リポジトリならその置き場）だけ。
// 作業ツリーの外なら、作業ディレクトリからファイルシステムの根まで。
// 作業ツリーの根より上の控えを数えると、信頼した親フォルダの下に置いた見知らぬリポジトリまで信頼したことになる。
//
// 作業ツリーの中の `.git`・`commondir`・`gitdir` はリポジトリの作り手が書いたものなので、リンクを辿らず、通常のファイルだけを上限の大きさまで読む。
// 読めない・形が違う・どれにも当たらないときは、信頼していない側に倒す。

import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
} from "node:fs"
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path"

import { isPlainObject } from "remeda"

import { readJsonFile } from "../../../adapter/lib/json-file.ts"
import { userHomeDir } from "../../../adapter/tsukumo-home.ts"
import type { SessionDriverOptions } from "../../core/session-driver.ts"

const CLAUDE_STATE_FILE_NAME = ".claude.json"

/** 立っていると、Claude Code が信頼の控えを1件も数えなくなる環境変数。 */
const IGNORE_PERSISTED_TRUST_ENV_NAME = "CLAUDE_CODE_IGNORE_PERSISTED_TRUST"

/** 立っていないとみなす値（小文字にしてから照らす）。 */
const FALSE_ENV_VALUES: ReadonlySet<string> = new Set(["", "0", "false", "no", "off"])

const GIT_ENTRY_NAME = ".git"
const GITDIR_PREFIX = "gitdir:"

/** 作業ツリーの中の指し先のファイル（`.git`・`commondir`・`gitdir`）を読む上限（バイト）。Claude Code の読み手と同じ 64 KiB。 */
const POINTER_FILE_LIMIT = 64 * 1024

/**
 * 作業ディレクトリを Claude Code が信頼しているか。
 * 控えは設定ディレクトリの `.claude.json` で、設定ディレクトリが無いときだけ `userHomeDir()` を読む。
 */
export function isFolderTrusted(
  options: Pick<SessionDriverOptions, "cwd" | "claudeConfigDir" | "inheritedEnv">,
): boolean {
  if (ignoresPersistedTrust(options.inheritedEnv[IGNORE_PERSISTED_TRUST_ENV_NAME])) {
    return false
  }
  const state = readJsonFile(join(options.claudeConfigDir ?? userHomeDir(), CLAUDE_STATE_FILE_NAME))
  if (!isPlainObject(state) || !isPlainObject(state.projects)) {
    return false
  }
  const projects = state.projects
  return trustScope(physicalPath(options.cwd)).some((folder) => {
    const entry = projects[folder]
    return isPlainObject(entry) && entry.hasTrustDialogAccepted === true
  })
}

function ignoresPersistedTrust(value?: string): boolean {
  return value !== undefined && !FALSE_ENV_VALUES.has(value.trim().toLowerCase())
}

/** 控えを数えるフォルダ。作業ツリーの中ならその根までと本体の根、外ならファイルシステムの根まで。 */
function trustScope(folder: string): readonly string[] {
  const lineage = selfAndAncestors(folder)
  const root = lineage.find(hasGitEntry)
  if (root === undefined) {
    return lineage
  }
  return [...lineage.slice(0, lineage.indexOf(root) + 1), canonicalRoot(root)]
}

function selfAndAncestors(folder: string): readonly string[] {
  const parent = dirname(folder)
  return parent === folder ? [folder] : [folder, ...selfAndAncestors(parent)]
}

/** `.git` があるか（種類は問わない）。確かめられないときもあるとみなし、それより上の控えを数えない側に倒す。 */
function hasGitEntry(folder: string): boolean {
  try {
    return lstatSync(join(folder, GIT_ENTRY_NAME), { throwIfNoEntry: false }) !== undefined
  } catch {
    // 確かめられないフォルダは作業ツリーの根とみなす（上の控えを数えない側に倒す）。
    return true
  }
}

/**
 * 作業ツリーの根から、Claude Code が控えを引く本体の根を返す。
 * 根の `.git` が `gitdir:` を書いたファイルで、指し先が作業ツリーの外にあり、その `commondir` と指し戻しの `gitdir` が食い違わない別の作業ツリーのときだけ、本体のチェックアウトを返す。
 * 共通の git ディレクトリの名前が `.git` でなければ bare リポジトリとして、その置き場そのものを返す。
 * それ以外（ふつうのリポジトリ・指し先が読めない・食い違う）は根そのもの。
 */
function canonicalRoot(root: string): string {
  try {
    return mainCheckoutOf(root).normalize("NFC")
  } catch {
    // 指し先のファイルが無い・読めない・大きすぎる作業ツリーは、根そのものの控えだけを数える。
    return root
  }
}

/** {@link canonicalRoot} の本体。指し先のファイルが読めなければ投げる。 */
function mainCheckoutOf(root: string): string {
  const pointer = readPointerFile(join(root, GIT_ENTRY_NAME))
  if (!pointer.startsWith(GITDIR_PREFIX)) {
    return root
  }
  const gitDir = resolve(root, pointer.slice(GITDIR_PREFIX.length).trim())
  // 指し先が作業ツリーの中にあれば、`commondir` も `gitdir` もリポジトリの作り手が書けるので、本体の根を引かない。
  if (isSelfOrInside(physicalPath(gitDir), physicalPath(root))) {
    return root
  }
  const commonDir = resolve(gitDir, readPointerFile(join(gitDir, "commondir")))
  if (dirname(gitDir) !== join(commonDir, "worktrees")) {
    return root
  }
  const backPointer = resolve(gitDir, readPointerFile(join(gitDir, "gitdir")))
  if (physicalPath(backPointer) !== join(physicalPath(root), GIT_ENTRY_NAME)) {
    return root
  }
  if (basename(commonDir) !== GIT_ENTRY_NAME) {
    return hasGitEntry(commonDir) ? root : commonDir
  }
  return dirname(commonDir)
}

/**
 * 指し先のファイルを読み、前後の空白を除いて返す。
 * リンク・通常のファイルでないもの・上限より大きいものは読まずに投げる（名前つきパイプでも開くところで待たない）。
 */
function readPointerFile(path: string): string {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const stat = fstatSync(fd)
    if (!stat.isFile() || stat.size > POINTER_FILE_LIMIT) {
      throw new Error("not a git pointer file")
    }
    const buffer = Buffer.alloc(stat.size)
    return buffer.toString("utf8", 0, readSync(fd, buffer, 0, stat.size, 0)).trim()
  } finally {
    closeSync(fd)
  }
}

function isSelfOrInside(path: string, folder: string): boolean {
  const fromFolder = relative(folder, path)
  return fromFolder !== ".." && !fromFolder.startsWith(`..${sep}`) && !isAbsolute(fromFolder)
}

/** 名前のリンクを解いた実の場所。無いパスは名前のまま。Claude Code の控えの鍵に合わせて NFC にそろえる。 */
function physicalPath(path: string): string {
  try {
    return realpathSync(path).normalize("NFC")
  } catch {
    // 無いパスは名前のまま照らす（どの控えにも当たらなければ信頼していない側に倒れる）。
    return resolve(path).normalize("NFC")
  }
}
