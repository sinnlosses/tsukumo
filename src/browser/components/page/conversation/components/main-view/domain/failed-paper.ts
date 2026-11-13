// 失敗で止まった紙の「残っているもの」の行を、計画の行と依頼の手順から作る。

import type { TurnStep } from "../../../../../../../shared/session/turn-step.ts"
import { narrateToolUse } from "../../../../../../domain/tool-narration.ts"
import type { WorkPlanRow } from "../../../domain/work-plan-row.ts"

/**
 * 済んだ段と止まった段で触ったファイルの数（重ならない）、落ちた手順の件数と先頭1件の言い方、通った手順の件数。
 * 該当が無い行は出さない。テストの件数そのものは記録に無いので、通った手順の件数で言う。
 */
export function remainingLinesOf(source: {
  readonly rows: readonly WorkPlanRow[]
  readonly steps: readonly TurnStep[]
}): readonly string[] {
  const doneRows = source.rows.filter((row) => row.state === "done")
  const files = new Set(
    source.rows
      .filter((row) => row.state === "done" || row.state === "failed")
      .flatMap((row) => row.touched),
  )
  const failed = source.steps.filter((step) => step.status.kind === "failed")
  const passed = source.steps.filter((step) => step.status.kind === "done")
  const [firstFailed] = failed
  return [
    ...(files.size > 0
      ? [
          `${doneRows.length > 0 ? `済んだ ${String(doneRows.length)} 段の変更` : "ここまでの変更"} ${String(files.size)} ファイル`,
        ]
      : []),
    ...(firstFailed === undefined
      ? []
      : [
          `落ちた手順 ${String(failed.length)} 件（${narrateToolUse(firstFailed.name, firstFailed.input) ?? firstFailed.name}）`,
        ]),
    ...(passed.length > 0 ? [`通った手順 ${String(passed.length)} 件`] : []),
  ]
}
