// `pnpm run check` が打つ段の並びを、`--full` の有無と変えたファイルから決める、という概念1つを持つ。

import { isDocumentOnlyChange } from "../../shared/document-change.ts"

export type Stage = {
  readonly name: string
  /** `pnpm run <name>` のあとに渡す引数。 */
  readonly args: readonly string[]
  /** 軽い段のあとに並べて走らせる重い段か。 */
  readonly heavy: boolean
}

export const E2E_BAIL_COUNT = 3

/** 文書だけの変更でも打つ、ファイルの大きさの上限の検査。 */
const TOKEN_LIMIT_STAGE: Stage = { name: "token-limit", args: [], heavy: false }

/** `files` は流す E2E のファイル（空なら全件）。 */
export function e2eStage(files: readonly string[]): Stage {
  return { name: "test:e2e", args: [...files, `--bail=${E2E_BAIL_COUNT}`], heavy: true }
}

/** 文書だけの変更で打つ文書の検査。 */
export const DOCUMENT_CHECK_TEST_FILES = [
  "test/scripts/document/conflict-marker.test.ts",
  "test/scripts/document/task-id.test.ts",
  "test/scripts/document/section-reference-repository.test.ts",
  "test/scripts/document/symbol-reference.test.ts",
  "test/comment-reference.test.ts",
  "test/e2e-reference.test.ts",
  "test/scripts/document/document-index-repository.test.ts",
  "test/achievement-scene-reference.test.ts",
] as const

export type StagePlan = {
  readonly stages: readonly Stage[]
  /** 段の選び方を知らせる1行（無ければ空）。 */
  readonly notice: string
}

/** 単体の段を関連のテストに絞るときの、`pnpm run test` への先頭の引数。 */
export const RELATED_FLAG = "--related"

const CODE_DIRECTORIES = ["src/", "test/", "scripts/"]

/**
 * `changedPaths` が空なら変えたファイルを集められなかったものとして扱う。
 * `chooseE2eStages` は E2E の段を選ぶ呼び出しで、文書だけの変更では呼ばない。
 * `setupFiles` は Vitest の設定に挙がる準備のファイル。どのテストからも import されず関連で辿れないので、
 * 変えたときは単体を全件に戻す。
 */
export function planStages(
  changedPaths: readonly string[],
  chooseE2eStages: () => readonly Stage[],
  forceFull: boolean,
  setupFiles: readonly string[],
): StagePlan {
  if (isDocumentOnlyChange(changedPaths)) {
    return {
      stages: [
        { name: "format:check", args: [], heavy: false },
        TOKEN_LIMIT_STAGE,
        { name: "test:document", args: DOCUMENT_CHECK_TEST_FILES, heavy: false },
      ],
      notice: "文書だけの変更のため format:check・token-limit と文書の検査だけを打つ",
    }
  }
  const touchesSetup = changedPaths.some((path) => setupFiles.includes(path))
  const codePaths = forceFull || touchesSetup ? [] : changedPaths.filter(isCodePath)
  const narrowed = codePaths.length > 0
  return {
    stages: [
      { name: "typecheck", args: [], heavy: false },
      { name: "lint", args: [], heavy: false },
      { name: "format:check", args: [], heavy: false },
      TOKEN_LIMIT_STAGE,
      { name: "test", args: narrowed ? [RELATED_FLAG, ...codePaths] : [], heavy: true },
      ...chooseE2eStages(),
    ],
    notice: narrowed ? "単体は変えたファイルに関連するものだけ" : "",
  }
}

function isCodePath(path: string): boolean {
  return CODE_DIRECTORIES.some((directory) => path.startsWith(directory))
}
