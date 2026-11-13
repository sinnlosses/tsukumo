// 検証結果の1行に tsukumo が付ける裏取りの印（記録あり（実行）・記録あり（控え）・申告のみ）の決め方。
// 印は書き手に申告させず、同じ依頼で見た Bash の記録と検証の控えだけから決める。

import type { ReportVerification, VerificationStage } from "./report-verification.ts"

/**
 * 行の裏取りの印。`run` は打った Bash と照らした、`record` は検証の控えの段と照らした（段の成否と件数を持つ）、`claimed` は書き手の申告だけ。
 */
export type ReportCheckSeal =
  | { readonly kind: "run" }
  | { readonly kind: "record"; readonly stage: VerificationStage }
  | { readonly kind: "claimed" }

/** 行の `command` とそのまま一致した、同じ依頼の最後の Bash の終わり方。打っていなければ `none`。 */
export type CheckBashOutcome = "none" | "running" | "succeeded" | "failed"

const TW_VERIFY = /^tw verify(?:\s|$)/

/**
 * 1行の印を決める。`ok`・`ng` の行だけが記録ありになりうる。
 * 実行に当たるのは、Bash が終わっていて、成否が行の状態と合う（`ok` は成功、`ng` は失敗）とき。
 * 実行に当たらなければ、`command` が `tw verify` で始まるか `pnpm run <段の名前>`（名前の後ろは空白か末尾）を含み、
 * 控えのその段の成否が行の状態と合う（`ok` は `passed`・`carried`、`ng` は `failed`）とき控えに当たる。
 */
export function sealOfCheck(
  check: { readonly status: string; readonly command: string },
  bash: CheckBashOutcome,
  verification: ReportVerification,
): ReportCheckSeal {
  const command = check.command.trim()
  if (command === "" || (check.status !== "ok" && check.status !== "ng")) {
    return { kind: "claimed" }
  }
  const failedRow = check.status === "ng"
  if ((bash === "succeeded" && !failedRow) || (bash === "failed" && failedRow)) {
    return { kind: "run" }
  }
  if (verification.kind !== "checked") {
    return { kind: "claimed" }
  }
  const stage = verification.stages.find(
    (candidate) =>
      (candidate.result === "failed") === failedRow &&
      (TW_VERIFY.test(command) || runsStage(command, candidate.name)),
  )
  return stage === undefined ? { kind: "claimed" } : { kind: "record", stage }
}

function runsStage(command: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`(?:^|\\s)pnpm run ${escaped}(?:\\s|$)`).test(command)
}
