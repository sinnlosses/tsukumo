// tsukumo が自分の持ち物を置くホームのディレクトリ（既定は `~/.tsukumo/`）。ホームの場所を
// 組み立てるのはここだけ（覚えたキャラクターの `state.json` も、画面から作ったキャラクターパックも、
// 同じ親の下に並ぶ。`docs/design.md` 7.1 / `docs/screen-design.md` 13.6）。
//
// 呼んだときだけ `homedir()` と環境変数を読む（モジュールのトップレベルでは触らない。
// `docs/coding-standards.md`「外の世界に依存する値」）。cwd には依存させない — どのプロジェクトから
// 起こしても同じものを読む（相対パスを渡したときだけ、渡した人の意図として cwd 相対で解く）。
//
// `process.env` を読む2箇所めをここに置いたのは、`tsukumoHomeDir()` を呼ぶのが adapter の
// 複数ファイルの既定引数の中で、配線層（`src/cli.ts` / `src/main.ts`）から設定を渡す道が無いため。
// 配って回るとホームの下に置き場が1つ増えるたびに配線を足すことになり、足し忘れが黙って
// 効かない形で残る（読み取り箇所が2つを超えないことは `test/architecture.test.ts` が見張る）。

import { homedir } from "node:os"
import { join, resolve } from "node:path"
import process from "node:process"

import { HOME_ENV_NAME } from "../core/config.ts"

const HOME_DIR_NAME = ".tsukumo"

/**
 * ホームのディレクトリ。`TSUKUMO_HOME` を渡すとホームごとそこへ移る（`state.json`・雑談の
 * 要約とアーカイブ・トークンの記録・画面から作ったパックのすべて）。渡すのは並行して動かしたい
 * 人が明示的に渡すときだけで、セッション単位で自動には分けない（`docs/design.md` 5章）。
 *
 * 未設定・空文字は既定の `~/.tsukumo`（`resolveViewPort` と同じ扱い）。相対パスは cwd 相対、
 * 絶対パスはそのまま（`TSUKUMO_CHARACTER` と同じ規則）。`~` は展開しない — 展開するのは
 * シェルの仕事で、自前で展開すると規則が2つの環境変数で食い違う。
 */
export function tsukumoHomeDir(): string {
  const raw = process.env[HOME_ENV_NAME]?.trim()
  return raw === undefined || raw === "" ? join(homedir(), HOME_DIR_NAME) : resolve(raw)
}
