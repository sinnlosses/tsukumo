// tsukumo が自分の持ち物を置くホームのディレクトリ（既定は `~/.tsukumo/`）。ホームの場所を組み立てるのはここだけ。
// cwd には依存させない。どのプロジェクトから起こしても同じものを読む（相対パスを渡したときだけ cwd 相対で解く）。
//
// `process.env` を読む2箇所めをここに置いている（`docs/coding-standards.md`「外部の入力を読む場所を1つにする」の例外）。
// `tsukumoHomeDir()` を呼ぶのは adapter の複数ファイルの既定引数の中で、配線層から設定を渡す道が無い。
// 配って回るとホームの下に置き場が1つ増えるたびに配線を足すことになり、足し忘れが黙って効かない形で残る。
// 読み取り箇所が2つを超えないことは検査が見張る。

import { homedir } from "node:os"
import { join, resolve } from "node:path"
import process from "node:process"

import { ENV_NAMES } from "../core/config.ts"

const HOME_DIR_NAME = ".tsukumo"
const CLAUDE_CONFIG_DIR_NAME = ".claude"

/**
 * ホームのディレクトリ。`TSUKUMO_HOME` を渡すとホームごとそこへ移る（`state.json`・あらすじと会話のアーカイブ・トークンの記録・画面から作ったパックのすべて）。
 * セッション単位で自動には分けない。
 *
 * 未設定・空文字は既定の `~/.tsukumo`。相対パスは cwd 相対、絶対パスはそのまま。
 * `~` は展開しない。自前で展開すると `TSUKUMO_CHARACTER` と規則が食い違う。
 */
export function tsukumoHomeDir(): string {
  const raw = process.env[ENV_NAMES.home.name]?.trim()
  return raw === undefined || raw === "" ? join(userHomeDir(), HOME_DIR_NAME) : resolve(raw)
}

/** 利用者のホームディレクトリ（`~`）。`homedir()` を読むのはこのファイルだけ。 */
export function userHomeDir(): string {
  return homedir()
}

/** Claude Code の設定ディレクトリの既定（`~/.claude`）。 */
export function defaultClaudeConfigDir(): string {
  return join(userHomeDir(), CLAUDE_CONFIG_DIR_NAME)
}
