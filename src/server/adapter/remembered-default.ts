// **次に起こすときの初期値**をホームの状態ファイル（`~/.tsukumo/state.json`）に覚える。
// 覚えるのは2つ — 直前まで出していたキャラクターパックの名前と、新しいセッションの既定
// （モデル・許可モード。`docs/screen-design.md` 13.6 の表）。
//
// **状態ファイルに触るのはここだけ**（`docs/design.md` 5章）。**2つを1ファイルに置いてある
// のは、書き込みがファイル丸ごとの置き換えだから** — 別々のモジュールから書くと、
// 後から書いたほうが相手の欄を消す。だから読むのも書くのもこの1つの境界に閉じ、
// 書くときは**残りの欄を読み直してから**載せ替える（原則3「1ファイル = 1つの境界」）。
//
// **どちらも選択そのものはセッション限り**（起こし直すと初期値に戻る／帯で変えた値は
// そのセッション限り）だが、**次に起こすときの初期値としてはここに残る**。
//
// 保存するのは**パックの名前と既定の2語だけ**。会話に関わる値をここに混ぜない
// （docs/coding-standards.md「会話内容の扱い」）。

import { join } from "node:path"

import { z } from "zod"

import { MODEL_ALIASES } from "../../shared/command.ts"
import {
  BUILTIN_SESSION_DEFAULT,
  SESSION_DEFAULT_PERMISSION_MODES,
  type SessionDefault,
} from "../../shared/session-default.ts"
import { readJsonFile, writeJsonFile } from "./lib/json-file.ts"
import { tsukumoHomeDir } from "./tsukumo-home.ts"

const STATE_FILE_NAME = "state.json"

/**
 * 状態ファイルの中身。**欄ごとに別のスキーマで読む**ので、片方が壊れていても
 * もう片方は読める（両方を1つの `z.object` にすると、知らないモデル名が1つ入っただけで
 * 覚えたキャラクターまで落ちる）。
 */
const characterStateSchema = z.object({ character: z.string() })

const sessionDefaultStateSchema = z.object({
  sessionDefault: z.object({
    model: z.enum(MODEL_ALIASES),
    permissionMode: z.enum(SESSION_DEFAULT_PERMISSION_MODES),
  }),
})

/**
 * 読み出した状態ファイル。**欄が `| undefined` なのは外の世界を写した直後だから**
 * （`docs/coding-standards.md`「「無いかもしれない」値」の例外1）。**畳むのは読む関数の出口**で、
 * ここから外へは `| undefined` のまま出ない。
 */
type RememberedState = {
  readonly character: string | undefined
  readonly sessionDefault: SessionDefault | undefined
}

/**
 * 覚えた名前を読む。**ファイルが無い・JSON が壊れている・形が違うときは undefined**
 * （呼び出し側が同梱の既定へ落ちる。指すパックが一覧に無いかどうかは呼び出し側の判断で、
 * ここでは確かめない）。
 *
 * `path` は `readFakeSession` の `path` 引数と同じで、差し替えられるのは置き場所だけ
 * （テストがホームを汚さないため）。
 */
export function readRememberedCharacter(path: string = defaultStatePath()): string | undefined {
  return readState(path).character
}

/**
 * 覚えた「新しいセッションの既定」を読む。**ファイルが無い・壊れている・知らない値のときは
 * 同梱の既定**（`BUILTIN_SESSION_DEFAULT`）——起動が前提不足で止まらないように、ここで
 * 「必ず値がある」型へ畳む（`docs/requirements.md` 4.1）。
 */
export function readRememberedSessionDefault(path: string = defaultStatePath()): SessionDefault {
  return readState(path).sessionDefault ?? BUILTIN_SESSION_DEFAULT
}

/**
 * 覚えた名前を書く。**失敗しても例外を投げない**（常駐プロセスは描画1回の失敗で落ちない。
 * docs/coding-standards.md「エラーハンドリング」）。書けなかった回はその回を諦めて次へ進む。
 * ディレクトリが無ければ作る。
 */
export function writeRememberedCharacter(
  character: string,
  path: string = defaultStatePath(),
): void {
  const state = readState(path)
  writeState({ character, sessionDefault: state.sessionDefault }, path)
}

/** 覚えた「新しいセッションの既定」を書く（失敗の扱いは {@link writeRememberedCharacter} と同じ）。 */
export function writeRememberedSessionDefault(
  sessionDefault: SessionDefault,
  path: string = defaultStatePath(),
): void {
  const state = readState(path)
  writeState({ character: state.character, sessionDefault }, path)
}

/** 状態ファイルを読む。**読めない欄はその欄だけ undefined**（ファイルごと捨てない）。 */
function readState(path: string): RememberedState {
  const parsed = readJsonFile(path)
  const character = characterStateSchema.safeParse(parsed)
  const sessionDefault = sessionDefaultStateSchema.safeParse(parsed)
  return {
    character: character.success ? character.data.character : undefined,
    sessionDefault: sessionDefault.success ? sessionDefault.data.sessionDefault : undefined,
  }
}

/**
 * 状態ファイルを書く。**値の無い欄は書かない**（`JSON.stringify` が `undefined` の欄を落とす）
 * ので、一度も覚えていない欄は現れない。
 */
function writeState(state: RememberedState, path: string): void {
  writeJsonFile(path, state)
}

/** 既定の保存先。ホームの場所は `src/server/adapter/tsukumo-home.ts` が持つ（呼んだときだけ読む）。 */
function defaultStatePath(): string {
  return join(tsukumoHomeDir(), STATE_FILE_NAME)
}
