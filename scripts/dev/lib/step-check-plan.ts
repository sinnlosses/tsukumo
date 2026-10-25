// `tw step` の段の検査が打つコマンドの並びを、変えたファイルから決める、という概念1つを持つ。

import { isCodePath, RELATED_FLAG } from "./check-stage.ts"

/** `pnpm run <script>` のあとに渡す引数つきの1コマンド。 */
export type StepCheckCommand = readonly string[]

/** 変えたコードのファイルが無ければ、単体の段は打たない。 */
export function planStepCheck(changedPaths: readonly string[]): readonly StepCheckCommand[] {
  const codePaths = changedPaths.filter(isCodePath)
  return [
    ["token-limit"],
    ["typecheck"],
    ["lint"],
    ...(codePaths.length > 0 ? [["test", RELATED_FLAG, ...codePaths]] : []),
  ]
}
