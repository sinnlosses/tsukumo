// 利用枠を SDK の実験中の口に問い合わせ、画面が要る形（`PlanUsageReport`）へ写す。
// 実験中の名前（`usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET`）を呼ぶのはここ1本に閉じる（`docs/research/plan-usage.md`「論点1」）。

import { z } from "zod"

import {
  NOT_APPLICABLE_PLAN_USAGE,
  type PlanUsageReport,
  type PlanUsageWindow,
  UNAVAILABLE_PLAN_USAGE,
} from "../../../shared/plan-usage/plan-usage.ts"

/**
 * {@link readPlanUsage} が要る口だけを写した形。
 * `query()` の戻り値そのものを引数に取らないのは、本物のセッションを起こさずに写しを検査できるようにするため。
 */
type PlanUsageSource = {
  readonly usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET: (opts: {
    readonly skipBehaviors: boolean
  }) => Promise<unknown>
}

const rateLimitWindowSchema = z
  .object({ utilization: z.number().nullable(), resets_at: z.string().nullable() })
  .nullable()
  .optional()

/**
 * SDK が返す形のうち画面が要る鍵だけを見るスキーマ。
 * `behaviors` は `skipBehaviors: true` を渡すので運ばれてこない前提で、そもそも読まない。
 */
const sdkPlanUsageSchema = z.object({
  rate_limits_available: z.boolean(),
  rate_limits: z
    .object({ five_hour: rateLimitWindowSchema, seven_day: rateLimitWindowSchema })
    .nullable(),
})

/**
 * 利用枠を SDK に問い合わせる。取れなかった回・読めない形は「取れない」を返すだけで、例外は外へ出さない。
 *
 * `skipBehaviors: true` を必ず渡す。
 * 渡さないと本体が手元の transcript を7日ぶん走査して `behaviors` を作る。
 * 利用枠を読むだけの都合で、会話の中身に触る処理を tsukumo の側から起こさない（`docs/coding-standards.md`「会話内容の扱い」）。
 */
export async function readPlanUsage(session: PlanUsageSource): Promise<PlanUsageReport> {
  try {
    return toPlanUsage(
      await session.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({
        skipBehaviors: true,
      }),
    )
  } catch {
    return UNAVAILABLE_PLAN_USAGE
  }
}

/**
 * SDK が返した形を tsukumo の形に写す（SDK の語彙を外へ出さない）。読めない形のときは「取れない」。
 * `rate_limits_available` が `false`（API キーなど）のときは「該当しない」。
 * 再読み込みしても変わらないので、取れないとは別の状態にする。
 *
 * 本物の `query()` を呼ばずに写しを検査できるよう、公開してある。
 */
export function toPlanUsage(value: unknown): PlanUsageReport {
  const parsed = sdkPlanUsageSchema.safeParse(value)
  if (!parsed.success) {
    return UNAVAILABLE_PLAN_USAGE
  }

  const { rate_limits_available: available, rate_limits: rateLimits } = parsed.data
  if (!available || rateLimits === null) {
    return NOT_APPLICABLE_PLAN_USAGE
  }

  return {
    kind: "ready",
    usage: {
      fiveHour: toWindow(rateLimits.five_hour),
      sevenDay: toWindow(rateLimits.seven_day),
    },
  }
}

/** 1つの枠を写す。`null` / 無い / 読めない戻る時刻は `undefined`（外の世界の「無い」をそのまま写す）。 */
function toWindow(
  window:
    | { readonly utilization: number | null; readonly resets_at: string | null }
    | null
    | undefined,
): PlanUsageWindow {
  if (window === null || window === undefined) {
    return { utilization: undefined, resetsAt: undefined }
  }
  return {
    utilization: window.utilization ?? undefined,
    resetsAt: window.resets_at === null ? undefined : parseIsoInstant(window.resets_at),
  }
}

/** ISO 8601 の戻る時刻をエポックミリ秒に直す。読めない綴りは `undefined`。 */
function parseIsoInstant(iso: string): number | undefined {
  try {
    return Temporal.Instant.from(iso).epochMilliseconds
  } catch {
    return undefined
  }
}
