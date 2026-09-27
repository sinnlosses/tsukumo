// ブラウザ側（`src/browser/`）を組み立てて `dist/browser/` に置く。起動時ではなくここで作る
// （`src/server/view-server/adapter/bundle.ts` 冒頭）。
//
// 打つのは `pnpm install` のあとに1回と、`src/browser/` を直したあと。`pnpm run dev` の開発サーバは
// `dist/browser/` を書き換えないので、開発中に直したぶんを次の起動に乗せるにも打つ。成果物は
// `.gitignore` してあるので、リポジトリを取り直したときにも1回要る。
//
// 使い方: pnpm run build

import process from "node:process"

import { buildUiBundle, builtUiDir } from "../src/server/view-server/adapter/bundle.ts"

const result = await buildUiBundle()
if (!result.ok) {
  process.stderr.write(`ブラウザ側を組み立てられない\n${result.reason}\n`)
  process.exit(1)
}

process.stdout.write(`組み立てた: ${builtUiDir()}\n`)
