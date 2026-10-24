// リポジトリ全体を読んで規約を見るテストの一覧と、絞り込みの引数にそれを足す組み立て、という概念1つを持つ。

import { readdirSync } from "node:fs"
import { join } from "node:path"

import { DOCUMENT_CHECK_TEST_PATHS } from "./check-stage.ts"

const ARCHITECTURE_TEST_DIRECTORY = "test/architecture/"

const CONVENTION_TEST_PATHS = [ARCHITECTURE_TEST_DIRECTORY, ...DOCUMENT_CHECK_TEST_PATHS] as const

/**
 * テストファイルのパスに見える引数（`test/` で始まるか `.test.ts(x)` で終わる）があるときだけ、
 * 未指定の規約のテストを後ろに足す。フラグの値（`-t パターン` など）や `--` は絞り込みに数えない。
 */
export function withConventionTests(args: readonly string[]): readonly string[] {
  const hasFilter = args.some(
    (arg) => !arg.startsWith("-") && (arg.startsWith("test/") || /\.test\.tsx?$/.test(arg)),
  )
  if (!hasFilter) {
    return args
  }
  return appendMissing(args, CONVENTION_TEST_PATHS)
}

/**
 * `vitest related` に渡す引数。絞り込みの有無に関わらず、未指定の規約のテストを足す。
 * `related` の引数は変えたファイルとして読まれ、ディレクトリは展開されないので、
 * 規約のディレクトリは列挙済みのテストファイル（`conventionTests`。`listConventionTests`）に置き換えて足す。
 */
export function withRelatedConventionTests(
  args: readonly string[],
  conventionTests: readonly string[],
): readonly string[] {
  return appendMissing(args, conventionTests)
}

/** `root` の下で、規約のディレクトリごとに `*.test.ts(x)` を再帰で列挙した `root` 相対のパス。 */
export function listConventionTests(root: string): readonly string[] {
  return CONVENTION_TEST_PATHS.flatMap((directory) => listTests(root, directory))
}

function listTests(root: string, directory: string): readonly string[] {
  return readdirSync(join(root, directory), { withFileTypes: true })
    .toSorted((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) =>
      entry.isDirectory()
        ? listTests(root, `${directory}${entry.name}/`)
        : /\.test\.tsx?$/.test(entry.name)
          ? [`${directory}${entry.name}`]
          : [],
    )
}

function appendMissing(args: readonly string[], paths: readonly string[]): readonly string[] {
  return [...args, ...paths.filter((file) => !args.includes(file))]
}
