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

import { HOME_ENV_NAME } from "../core/config.ts"

const HOME_DIR_NAME = ".tsukumo"

/**
 * ホームのディレクトリ。`TSUKUMO_HOME` を渡すとホームごとそこへ移る（`state.json`・雑談の要約とアーカイブ・トークンの記録・画面から作ったパックのすべて）。
 * セッション単位で自動には分けない。
 *
 * 未設定・空文字は既定の `~/.tsukumo`。相対パスは cwd 相対、絶対パスはそのまま。
 * `~` は展開しない。自前で展開すると `TSUKUMO_CHARACTER` と規則が食い違う。
 */
export function tsukumoHomeDir(): string {
  const raw = process.env[HOME_ENV_NAME]?.trim()
  return raw === undefined || raw === "" ? join(homedir(), HOME_DIR_NAME) : resolve(raw)
}
