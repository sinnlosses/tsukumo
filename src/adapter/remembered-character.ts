// 直前まで出していたキャラクターパックの名前を覚える。ホームの状態ファイルに触るのはここだけ
// （docs/design.md 5章「remembered-character.ts」）。**選択そのものはセッション限り**
// （起こし直すと初期値に戻る）だが、**次の起動の初期値としてはここに残す**（docs/design.md 13.6）。
//
// 保存するのは**パックの名前だけ**。会話に関わる値をここに混ぜない
// （docs/coding-standards.md「会話内容の扱い」）。

import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { z } from "zod"

import { tsukumoHomeDir } from "./tsukumo-home.ts"

const STATE_FILE_NAME = "state.json"

const stateSchema = z.object({ character: z.string() })

/**
 * 覚えた名前を読む。**ファイルが無い・JSON が壊れている・形が違うときは undefined**
 * （呼び出し側が同梱の既定へ落ちる。指すパックが一覧に無いかどうかは呼び出し側の判断で、
 * ここでは確かめない）。
 *
 * `path` は `readFakeScript` の `path` 引数と同じで、差し替えられるのは置き場所だけ
 * （テストがホームを汚さないため）。
 */
export function readRememberedCharacter(path: string = defaultStatePath()): string | undefined {
  let content: string
  try {
    content = readFileSync(path, "utf8")
  } catch {
    return undefined
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return undefined
  }

  const state = stateSchema.safeParse(parsed)
  return state.success ? state.data.character : undefined
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
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify({ character }))
  } catch {
    // 書けなかった回は諦めて次へ進む。
  }
}

/** 既定の保存先。ホームの場所は `src/adapter/tsukumo-home.ts` が持つ（呼んだときだけ読む）。 */
function defaultStatePath(): string {
  return join(tsukumoHomeDir(), STATE_FILE_NAME)
}
