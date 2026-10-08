// `pnpm run check` が打つ段の並びを、`--full` の有無と変えたファイルから決める、という概念1つを持つ。

import { isDocumentOnlyChange } from "./document-change.ts"

export type Stage = {
  readonly name: string
  /** `pnpm run <name>` のあとに渡す引数。 */
  readonly args: readonly string[]
  /** 軽い段のあとに並べて走らせる重い段か。 */
  readonly heavy: boolean
}

/** 文書だけの変更で打つ文書の検査。 */
export const DOCUMENT_CHECK_TEST_FILES = [
  "test/conflict-marker.test.ts",
  "test/task-id.test.ts",
  "test/section-reference.test.ts",
  "test/comment-reference.test.ts",
  "test/e2e-reference.test.ts",
  "test/document-index.test.ts",
  "test/achievement-scene-reference.test.ts",
] as const

export type StagePlan = {
  readonly stages: readonly Stage[]
  /** 段の選び方を知らせる1行（無ければ空）。 */
  readonly notice: string
}

/**
 * `changedPaths` が空なら変えたファイルを集められなかったものとして扱う。
 * `chooseE2eStages` は E2E の段を選ぶ呼び出しで、文書だけの変更では呼ばない。
 */
export function planStages(
  changedPaths: readonly string[],
  chooseE2eStages: () => readonly Stage[],
): StagePlan {
  if (isDocumentOnlyChange(changedPaths)) {
    return {
      stages: [
        { name: "format:check", args: [], heavy: false },
        { name: "test", args: DOCUMENT_CHECK_TEST_FILES, heavy: false },
      ],
      notice: "文書だけの変更のため format:check と文書の検査だけを打つ",
    }
  }
  return {
    stages: [
      { name: "typecheck", args: [], heavy: false },
      { name: "lint", args: [], heavy: false },
      { name: "format:check", args: [], heavy: false },
      { name: "test", args: [], heavy: true },
      ...chooseE2eStages(),
    ],
    notice: "",
  }
}
