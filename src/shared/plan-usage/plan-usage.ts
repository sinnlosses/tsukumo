// 利用枠（`docs/glossary.md`「利用枠」）——5時間枠と7日間枠それぞれの、いまの使用率と戻る時刻。
// サーバ（手続き `planUsageProcedure` が配る）とブラウザ（サイドバーの札が取りに行く）の
// 両方が同じ値を見るので shared に置く（コンテキストの内訳と同じ考え方）。ここは値と型だけで
// `node:` にも `document` にも触らない。
//
// SDK の形をそのまま運ばない。 画面が要る2つの枠だけに写したのがここの型で、SDK の戻り値
// （`usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET()`）からの写しと検証は
// `readPlanUsage`（SDK の実験中の口を1本に閉じたアダプタ）が1箇所で行う。

import { z } from "zod"

/**
 * 1つの枠（5時間枠 / 7日間枠）の使用状況。SDK が `null` を返す・欄が無いときは
 * `undefined`（外の世界の「無い」をそのまま写す。`docs/coding-standards.md`「「無いかもしれない」値」の例外1）。
 */
export type PlanUsageWindow = {
  /** 使用率（0〜100の百分率。SDK の説明どおり）。 */
  readonly utilization: number | undefined
  /** 戻る時刻（エポックミリ秒。SDK は ISO 8601 の文字列で送る）。 */
  readonly resetsAt: number | undefined
}

/** 5時間枠と7日間枠。 */
export type PlanUsage = {
  readonly fiveHour: PlanUsageWindow
  readonly sevenDay: PlanUsageWindow
}

/**
 * 利用枠の問い合わせの結果。3つに割るのは、画面ですることが違うから
 * （`docs/coding-standards.md`「「無いかもしれない」値」「複数の「無い」が1つの状態」）——
 * `unavailable` は再読み込みで直る見込みがある（口が落ちた・429 など）、`not-applicable` は
 * claude.ai の契約でない（API キーなど）ので再読み込みしても変わらず、札から再読み込みの
 * ボタンを外す。
 */
export type PlanUsageReport =
  | { readonly kind: "ready"; readonly usage: PlanUsage }
  | { readonly kind: "unavailable" }
  | { readonly kind: "not-applicable" }

/** 取れなかった（落ちた・読めない）ときの結果。再読み込みで直る見込みがある。 */
export const UNAVAILABLE_PLAN_USAGE = { kind: "unavailable" } satisfies PlanUsageReport

/** claude.ai の契約でないときの結果（API キーなど）。再読み込みしても変わらない。 */
export const NOT_APPLICABLE_PLAN_USAGE = { kind: "not-applicable" } satisfies PlanUsageReport

// `.optional()` だとキー自体が無いことまで許し、`z.infer` の型でも鍵が
// `?:` になる（`docs/coding-standards.md`「「無いかもしれない」値」は `?:` を使わない）。
// 値そのものが `undefined` を取れる合併にして、鍵は必ずある形にする。
const planUsageWindowSchema = z.object({
  utilization: z.union([z.number(), z.undefined()]),
  resetsAt: z.union([z.number(), z.undefined()]),
})

/** 配る形そのもの（{@link PlanUsageReport} と同じ鍵）。 */
export const planUsageReportSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("ready"),
    usage: z.object({ fiveHour: planUsageWindowSchema, sevenDay: planUsageWindowSchema }),
  }),
  z.object({ kind: z.literal("unavailable") }),
  z.object({ kind: z.literal("not-applicable") }),
])
