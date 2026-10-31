// `tw step` の段の検査が打つコマンドの並びを、変えたファイルから決める、という概念1つを持つ。

import { isCodePath, RELATED_FLAG, WITHOUT_UNUSED_EXPORT_FLAG } from "./check-stage.ts"

/** `pnpm run <script>` のあとに渡す引数つきの1コマンド。 */
export type StepCheckCommand = readonly string[]

/**
 * 変えたコードのファイルが無ければ、単体の段は打たない。
 * `tw step` は最後でない段にだけ打たれ、使い手が後の段にある export を unused-export で落とさないよう外す。
 */
export function planStepCheck(changedPaths: readonly string[]): readonly StepCheckCommand[] {
  const codePaths = changedPaths.filter(isCodePath)
  return [
    ["token-limit"],
    ["typecheck"],
    ["lint"],
    ...(codePaths.length > 0
      ? [["test", RELATED_FLAG, WITHOUT_UNUSED_EXPORT_FLAG, ...codePaths]]
      : []),
  ]
}
