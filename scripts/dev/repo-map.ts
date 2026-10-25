// `src/` のファイルごとの export の名前と鏡のテストを、`.tw/local/repo-map.md` に書く入口。
// 委譲先が ls・find・grep で探す代わりに引く地図で、`.tw/local/` は git の外。
//
// 使い方:
//   pnpm run repo-map

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import process from "node:process"

import { buildRepoMap } from "../shared/repo-map.ts"
import { REPOSITORY_ROOT as ROOT } from "../shared/repository-root.ts"

const OUTPUT_DIRECTORY = `${ROOT}/.tw/local`

const sourcePaths = listFiles("src", /\.tsx?$/)
const sources = new Map(sourcePaths.map((path) => [path, readFileSync(`${ROOT}/${path}`, "utf8")]))
const testPaths = new Set(listFiles("test", /\.test\.tsx?$/))

mkdirSync(OUTPUT_DIRECTORY, { recursive: true })
writeFileSync(`${OUTPUT_DIRECTORY}/repo-map.md`, buildRepoMap(sources, testPaths))
process.stdout.write(`.tw/local/repo-map.md に ${sources.size} ファイルを書いた\n`)

function listFiles(directory: string, pattern: RegExp): readonly string[] {
  return readdirSync(`${ROOT}/${directory}`, { recursive: true, encoding: "utf8" })
    .filter((path) => pattern.test(path))
    .map((path) => `${directory}/${path}`)
}
