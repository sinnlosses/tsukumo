// tsukumo が自分の持ち物を置くホームのディレクトリ（`~/.tsukumo/`）。**ホームの場所を組み立てるのは
// ここだけ**（覚えたキャラクターの `state.json` も、画面から作ったキャラクターパックも、同じ親の
// 下に並ぶ。`docs/design.md` 7.1 / 13.6）。
//
// **呼んだときだけ `homedir()` を読む**（モジュールのトップレベルでは触らない。
// `docs/coding-standards.md`「外の世界に依存する値」）。cwd には依存させない — どのプロジェクトから
// 起こしても同じものを読む。

import { homedir } from "node:os"
import { join } from "node:path"

const HOME_DIR_NAME = ".tsukumo"

export function tsukumoHomeDir(): string {
  return join(homedir(), HOME_DIR_NAME)
}
