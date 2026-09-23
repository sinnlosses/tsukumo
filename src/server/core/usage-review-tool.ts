// 見直し（docs/glossary.md「見直し」）を受け取る2つのツールの決まりごと。ツールを載せるのは
// `src/server/adapter/sdk-tool.ts` で、ここにあるのはツールの名前・説明文と、受け付けるかを
// 決めて受け付けた呼び出しをイベントにする窓口（{@link createUsageReviewIntake}）。
// 決定の理由は docs/design.md「見直しのツールと状態」。
//
// **引数の形（型・列挙・整数）は zod の形で SDK が先に検査する**（崩れていれば handler は
// 呼ばれず、SDK が理由を `isError` 付きで返す）。ここで見るのは形の外の条（空の欄・件数・
// 識別子の重なり・見送った提案）だけ。

import { type SessionEvent } from "../../shared/session-event.ts"
import {
  USAGE_PROPOSAL_KIND_TARGETS,
  USAGE_PROPOSAL_KINDS,
  USAGE_REVIEW_STAGE_LABELS,
  USAGE_REVIEW_STAGES,
  type UsageReviewFindings,
  type UsageReviewStage,
  usageProposalKey,
} from "../../shared/usage-review.ts"

/** 段の進みを受け取るツールの名前（docs/glossary.md「usage_review_stage ツール」）。 */
export const USAGE_REVIEW_STAGE_TOOL_NAME = "usage_review_stage"

/** 結果を受け取るツールの名前（docs/glossary.md「usage_review_result ツール」）。 */
export const USAGE_REVIEW_RESULT_TOOL_NAME = "usage_review_result"

/** 1回の見直しで渡せる提案の上限（スキルの「効きの大きい順に3〜5件」に揃える）。 */
export const MAX_USAGE_PROPOSALS = 5

/**
 * モデルに見せる `usage_review_stage` の説明。**いつ呼ぶか**をここに書く（スキルの手順は
 * これを前提にする）。
 */
export const USAGE_REVIEW_STAGE_TOOL_DESCRIPTION =
  "トークン消費の減らし方の見直し（スキル token-usage-diet）で、段に入るたびに呼ぶ。" +
  "最初の段に入るときに必ず呼ぶ（この呼び出しで画面が「見直し中」になる）。" +
  `段は ${USAGE_REVIEW_STAGES.join(" → ")} の順。` +
  "戻り値に利用者が見送った提案の識別子（種類:対象）が並んだら、その提案は usage_review_result に入れない。" +
  "見直し以外では呼ばない。"

/** モデルに見せる `usage_review_result` の説明。 */
export const USAGE_REVIEW_RESULT_TOOL_DESCRIPTION =
  "見直しの結果を1回で渡す。tsukumo が提案の札として描く。見直し案をまとめ終えたときに呼ぶ。" +
  `提案は効きめの大きい順に${MAX_USAGE_PROPOSALS}件まで。同じ種類と対象の組を2度入れない。` +
  "受け付けられないときは理由が返るので、直して呼び直す。"

/** `stage` の引数の説明（段の名前と見出しの対応）。 */
export function usageReviewStageGuide(): string {
  const guide = USAGE_REVIEW_STAGES.map(
    (stage) => `${stage}（${USAGE_REVIEW_STAGE_LABELS[stage]}）`,
  ).join(" / ")
  return `いま入った段。${guide}`
}

/** 提案の `kind` の引数の説明（種類ごとに `target` へ何を入れるか）。 */
export function usageProposalKindGuide(): string {
  const guide = USAGE_PROPOSAL_KINDS.map(
    (kind) => `${kind}（target: ${USAGE_PROPOSAL_KIND_TARGETS[kind]}）`,
  ).join(" / ")
  return `提案の種類。${guide}`
}

/** 結果の handler の判定。`rejected` の `text` はそのまま戻り値になる。 */
export type UsageReviewVerdict =
  | { readonly kind: "accepted" }
  | { readonly kind: "rejected"; readonly text: string }

/** 2つのツールの handler が呼ぶ窓口。 */
export type UsageReviewIntake = {
  /** 段に入った。`usage-review-stage` を流し、戻り値の文面（見送った提案の一覧つき）を返す。 */
  readonly enterStage: (stage: UsageReviewStage, days: number) => string
  /** 結果を受け付けるか決め、受け付けたら `usage-review-result` を流す。 */
  readonly submit: (findings: UsageReviewFindings) => UsageReviewVerdict
}

/**
 * {@link UsageReviewIntake} を1つ作る。`dismissedKeys` は利用者が見送った提案の識別子
 * （`usageProposalKey`）を**呼ぶたびに読み直す**口（見直しの途中で見送りが増えても効く）。
 * `onEvent` は駆動のイベントの流れ（ここで例外を投げない）。
 */
export function createUsageReviewIntake(
  dismissedKeys: () => readonly string[],
  onEvent: (event: SessionEvent) => void,
): UsageReviewIntake {
  return {
    enterStage: (stage, days) => {
      onEvent({ kind: "usage-review-stage", stage, days })
      return usageReviewStageReply(dismissedKeys())
    },
    submit: (findings) => {
      const violations = usageReviewViolations(findings, dismissedKeys())
      if (violations.length > 0) {
        return { kind: "rejected", text: usageReviewRejectionText(violations) }
      }
      onEvent({ kind: "usage-review-result", findings })
      return { kind: "accepted" }
    },
  }
}

/**
 * 形の外の条の違反1つ。`count` は違反の数で、**モデルが書いた文面は持たない**（差し戻しの
 * 文面に写さない。`report-violation.ts` と同じ線）。
 */
type UsageReviewViolation =
  | { readonly kind: "blank-headline" }
  | { readonly kind: "too-many-proposals"; readonly count: number }
  | { readonly kind: "blank-field"; readonly count: number }
  | { readonly kind: "duplicate-key"; readonly count: number }
  | { readonly kind: "dismissed"; readonly count: number }

function usageReviewViolations(
  findings: UsageReviewFindings,
  dismissed: readonly string[],
): readonly UsageReviewViolation[] {
  const keys = findings.proposals.map(usageProposalKey)
  const counted = [
    { kind: "too-many-proposals", count: findings.proposals.length },
    {
      kind: "blank-field",
      count: findings.proposals.filter((proposal) =>
        [proposal.title, proposal.basis, proposal.action].some((field) => field.trim() === ""),
      ).length,
    },
    { kind: "duplicate-key", count: keys.length - new Set(keys).size },
    { kind: "dismissed", count: keys.filter((key) => dismissed.includes(key)).length },
  ] as const satisfies readonly UsageReviewViolation[]

  return [
    ...(findings.headline.trim() === "" ? [{ kind: "blank-headline" } as const] : []),
    ...counted.filter((violation) => violation.count > VIOLATION_THRESHOLDS[violation.kind]),
  ]
}

/** 違反にしない上限（これを超えたら違反）。 */
const VIOLATION_THRESHOLDS = {
  "too-many-proposals": MAX_USAGE_PROPOSALS,
  "blank-field": 0,
  "duplicate-key": 0,
  dismissed: 0,
} as const satisfies Record<Exclude<UsageReviewViolation["kind"], "blank-headline">, number>

function usageReviewRejectionText(violations: readonly UsageReviewViolation[]): string {
  return [
    "見直しの結果を受け付けられない。直して `usage_review_result` を呼び直すこと:",
    ...violations.map((violation) => `- ${violationLine(violation)}`),
  ].join("\n")
}

function violationLine(violation: UsageReviewViolation): string {
  switch (violation.kind) {
    case "blank-headline":
      return "`headline` が空。冒頭の一言を書く"
    case "too-many-proposals":
      return `提案が${violation.count}件ある。効きめの大きい順に${MAX_USAGE_PROPOSALS}件までに絞る`
    case "blank-field":
      return `\`title\` / \`basis\` / \`action\` のどれかが空の提案が${violation.count}件ある`
    case "duplicate-key":
      return `同じ \`kind\` と \`target\` の組が${violation.count}件重なっている。1件にまとめる`
    case "dismissed":
      return `利用者が見送った提案が${violation.count}件入っている。\`usage_review_stage\` の戻り値に並んだ組は除く`
  }
}

/**
 * `usage_review_stage` の戻り値。見送った提案が無ければ `"ok"` だけ。**並べるのは tsukumo が
 * 記録した識別子だけ**で、画面の状態は載せない。
 */
function usageReviewStageReply(dismissed: readonly string[]): string {
  return dismissed.length === 0
    ? "ok"
    : [
        "ok",
        "利用者が見送った提案（種類:対象）。usage_review_result に入れない:",
        ...dismissed.map((key) => `- ${key}`),
      ].join("\n")
}
