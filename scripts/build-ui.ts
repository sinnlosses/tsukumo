// ブラウザ側（`src/browser/`）を組み立てて `dist/browser/` に置く。**起動時ではなくここで作る**
// （`src/server/adapter/bundle.ts` 冒頭）。
//
// 打つのは `bun install` のあとに1回と、`src/browser/` を直したあと。`bun run dev` の見張りは
// 同じ場所へ出し直すので、開発中は打ち直さなくてよい。成果物は `.gitignore` してあるので、
// リポジトリを取り直したときにも1回要る。
//
// 使い方: bun run build

import process from "node:process"

import { buildUiBundle, builtUiDir } from "../src/server/adapter/bundle.ts"

const result = await buildUiBundle()
if (!result.ok) {
  process.stderr.write(`ブラウザ側を組み立てられない\n${result.reason}\n`)
  process.exit(1)
}

process.stdout.write(`組み立てた: ${builtUiDir()}\n`)
