// tsukumo が自分で持ち歩くもの（既定の立ち絵、`node_modules` の外部ライブラリなど）の置き場所を解く。
// cwd には依存しない。どのプロジェクトのディレクトリで起こしても、同梱物は tsukumo 自身が置かれている場所から読む。

import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * 環境変数などによる上書きと、同梱物の既定を解く。
 * 上書きが空でなければ cwd 相対（絶対パスならそのまま）、無ければ tsukumo 自身の場所の既定を使う。
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
 * 同梱物のパスを、tsukumo 自身の場所からの相対パスで解く。
 * 基準はこのファイルの3つ上のリポジトリのルートで、このファイルを別の深さへ動かすと `../../..` がずれる。
 *
 * 例: `bundledFilePath("characters", "tsukumo-spirit")` /
 * `bundledFilePath("node_modules", "mermaid", "dist", "mermaid.min.js")`
 */
export function bundledFilePath(...relativeSegments: readonly string[]): string {
  return join(fileURLToPath(new URL("../../..", import.meta.url)), ...relativeSegments)
}
