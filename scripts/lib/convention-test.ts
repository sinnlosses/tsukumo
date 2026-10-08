// リポジトリ全体を読んで規約を見るテストの一覧と、絞り込みの引数にそれを足す組み立て、という概念1つを持つ。

import { DOCUMENT_CHECK_TEST_FILES } from "./check-stage.ts"

export const CONVENTION_TEST_FILES = [
  "test/architecture.test.ts",
  ...DOCUMENT_CHECK_TEST_FILES,
] as const

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
  return [...args, ...CONVENTION_TEST_FILES.filter((file) => !args.includes(file))]
}
