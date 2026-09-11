// tsukumo が自分で持ち歩く同梱物（`vendor/` の外部ライブラリ、既定の立ち絵など）の置き場所を
// 解く。**cwd には依存しない。** どのプロジェクトのディレクトリで起こしても、同梱物は
// tsukumo 自身が置かれている場所から読む（docs/requirements.md 4.6）。

import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * 環境変数などによる上書きと、同梱物の既定を解く。**上書きが空でなければ cwd 相対**
 * （絶対パスならそのまま）、**無ければ tsukumo 自身の場所の既定**を使う。環境変数の読み取り
 * そのものは呼び出し側に残る（docs/coding-standards.md「外部の入力を読む場所を1つにする」。
 * ここが受け取るのは読み取ったあとの値）。
 */
export function resolveBundledDir(
  overridePath: string | undefined,
  cwd: string,
  defaultRelativeSegments: readonly string[],
): string {
  const trimmed = overridePath?.trim()
  if (trimmed !== undefined && trimmed !== "") {
    return resolve(cwd, trimmed)
  }

  return bundledFilePath(...defaultRelativeSegments)
}

/**
 * 同梱物のパスを、tsukumo 自身の場所からの相対パスで解く。基準はこのファイルの1つ上
 * （リポジトリのルート）。呼び出し側は cwd を渡さない・気にしない。
 *
 * 例: `bundledFilePath("vendor", "htmx.min.js")` / `bundledFilePath("characters", "tsukumo-spirit")`
 */
export function bundledFilePath(...relativeSegments: readonly string[]): string {
  return join(fileURLToPath(new URL("..", import.meta.url)), ...relativeSegments)
}
