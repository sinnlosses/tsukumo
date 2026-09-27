// 利用枠（`docs/glossary.md`「利用枠」）を SDK の実験中の口に問い合わせ、画面が要る形
// （`PlanUsageReport`）へ写す。実験中の名前（`usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET`）を
// 呼ぶのはここ1本に閉じる（`docs/research/plan-usage.md`「論点1」）。

import { z } from "zod"

import {
  NOT_APPLICABLE_PLAN_USAGE,
  type PlanUsageReport,
  type PlanUsageWindow,
  UNAVAILABLE_PLAN_USAGE,
} from "../../../shared/plan-usage/plan-usage.ts"

/**
 * {@link readPlanUsage} が要る口だけを写した形。`query()` の戻り値そのものを引数に取らない
 * のは、本物のセッションを起こさずに写しを検査できるようにするため（`ContextUsageSource` と
 * 同じ理由）。
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
 * SDK が返す形のうち画面が要る鍵だけを見るスキーマ（外の世界の値なので境界で検証する。
 * `docs/coding-standards.md`「型を迂回するキャストを使わない」）。`behaviors` は
 * `skipBehaviors: true` を渡すので運ばれてこない前提で、そもそも読まない。
 */
const sdkPlanUsageSchema = z.object({
  rate_limits_available: z.boolean(),
  rate_limits: z
    .object({ five_hour: rateLimitWindowSchema, seven_day: rateLimitWindowSchema })
    .nullable(),
})

/**
 * 利用枠を SDK に問い合わせる（`docs/glossary.md`「利用枠」）。取れなかった回・読めない形は
 * 「取れない」を返すだけで、例外は外へ出さない。
 *
 * `skipBehaviors: true` を必ず渡す——渡さないと本体が手元の transcript を7日ぶん走査して
 * `behaviors` を作る（`docs/coding-standards.md`「会話内容の扱い」。呼ぶのはこの口だけの
 * 都合で、会話の中身に触る処理を tsukumo の側から起こさない）。
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
 * SDK が返した形を tsukumo の形に写す（SDK の語彙を外へ出さない）。読めない形のときは
 * 「取れない」。`rate_limits_available` が `false`（API キーなど）のときは「該当しない」——
 * 再読み込みしても変わらないので、取れないとは別の状態にする
 * （`docs/research/plan-usage.md`「論点1」）。
 *
 * 本物の `query()` を呼ばずに写しを検査できるように、`startSdkDriver` の外に出して公開して
 * ある（`toContextUsage` と同じ理由）。
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
