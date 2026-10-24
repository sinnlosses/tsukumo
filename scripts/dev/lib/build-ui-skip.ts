// `pnpm run build` が、組み立ての入力が前回と同じなら組み立てを飛ばす、という判定を持つ。
// 入力は src/browser/・src/shared/（`bundledSourceFingerprint`）と、ここで見る設定・依存のファイル。

import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

import {
  bundledSourceFingerprint,
  readUiBundle,
} from "../../../src/server/view-server/adapter/bundle.ts"

const BUILD_INPUT_FINGERPRINT_FILE_NAME = "build-input-fingerprint.txt"

/** 組み立て結果を変えうる、ソースの外の入力（vite の設定・依存・型の設定）。 */
const BUILD_INPUT_FILES = [
  "vite.config.ts",
  "pnpm-lock.yaml",
  "tsconfig.json",
  "scripts/dev/lib/strip-css-comment.ts",
] as const

/** 成果物が読めて、ソースと入力ファイルの指紋がどちらも前回の組み立てと同じ（比べられないときは組み立て直す）。 */
export async function isBuiltUiCurrent(builtDir: string, root: string): Promise<boolean> {
  const [built, source, stored, current] = await Promise.all([
    readUiBundle(builtDir),
    bundledSourceFingerprint(),
    readFile(join(builtDir, BUILD_INPUT_FINGERPRINT_FILE_NAME), "utf8").catch(() => undefined),
    buildInputFingerprint(root),
  ])
  return built.ok && !built.outdated && source !== undefined && stored === current
}

/** 組み立てが通ったあとに、そのときの入力ファイルの指紋を成果物の隣へ残す。 */
export async function recordBuildInputs(builtDir: string, root: string): Promise<void> {
  await writeFile(
    join(builtDir, BUILD_INPUT_FINGERPRINT_FILE_NAME),
    await buildInputFingerprint(root),
  )
}

async function buildInputFingerprint(root: string): Promise<string> {
  const hash = createHash("sha256")
  for (const name of BUILD_INPUT_FILES) {
    const content = await readFile(join(root, name)).catch(() => undefined)
    hash.update(`${name}\0`)
    hash.update(content ?? "")
    hash.update("\0")
  }
  return hash.digest("hex")
}
