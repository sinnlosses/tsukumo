// ブラウザ側（`src/browser/`）を組み立てて `dist/browser/` に置く。起動時ではなくここで作る
// （起動は `readUiBundle` が成果物を読むだけ）。
//
// 打つのは `pnpm install` のあとに1回と、`src/browser/` を直したあと。`pnpm run dev` の開発サーバは
// `dist/browser/` を書き換えないので、開発中に直したぶんを次の起動に乗せるにも打つ。成果物は
// `.gitignore` してあるので、リポジトリを取り直したときにも1回要る。
//
// 使い方: pnpm run build

import process from "node:process"

import { buildUiBundle, builtUiDir } from "../../src/server/view-server/adapter/bundle.ts"

process.stdout.write("Building UI... ")
const started = performance.now()
const result = await buildUiBundle(builtUiDir())
if (!result.ok) {
  process.stdout.write("failed\n")
  process.stderr.write(`ブラウザ側を組み立てられない\n${result.reason}\n`)
  process.exit(1)
}

const seconds = ((performance.now() - started) / 1000).toFixed(1)
process.stdout.write(`done (${seconds}s)\n`)
