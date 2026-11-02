import { describe, expect, it } from "vitest"

import { schemaSwitchSection } from "../../../scripts/runtime/schema-switch-section.ts"
import { REPORT_USAGE_FORMAT_VERSION } from "../../../src/server/report/core/usage/report-usage-record.ts"

const accepted = (at: string, sessionId = "s1") => ({ at, sessionId, driver: "sdk" })
const rejected = (
  at: string,
  reasons: readonly string[],
  chars: number,
  nextCall?: { reasons: readonly string[]; chars: number },
  sessionId = "s1",
) => ({
  at,
  sessionId,
  driver: "sdk",
  v: REPORT_USAGE_FORMAT_VERSION,
  kind: "rejected",
  reasons,
  argumentChars: { total: chars, fields: {} },
  inheritedFields: [],
  reportSchema: "a2ui",
  ...(nextCall === undefined ? {} : { nextCall }),
})

describe("切り替えの前後の差し戻しの集計", () => {
  const section = schemaSwitchSection([
    {
      label: "前",
      rows: [
        accepted("2026-10-21T09:00:00+09:00"),
        rejected("2026-10-21T09:01:00+09:00", ["plain-word"], 1000, { reasons: [], chars: 1200 }),
        rejected("2026-10-21T09:02:00+09:00", ["tool-error", "plain-word"], 1000),
        { ...accepted("2026-10-21T09:03:00+09:00"), driver: "fake", sessionId: "fake-session" },
      ],
    },
    {
      label: "後",
      rows: [
        rejected("2026-10-28T09:00:00+09:00", ["tool-error"], 2000, {
          reasons: ["tool-error"],
          chars: 2000,
        }),
        rejected("2026-10-28T09:01:00+09:00", ["tool-error"], 2000, { reasons: [], chars: 2400 }),
        accepted("2026-10-28T09:02:00+09:00"),
      ],
    },
  ])

  it("率は疑似セッションを除いた呼び出しを分母にする", () => {
    expect(section).toContain("呼び出し 3（受け付け 1、差し戻し 2）")
    expect(section).toContain("差し戻しの率 66.7%（tool-error を除くと 1行 33.3%）")
    expect(section).toContain("差し戻しの率 66.7%（tool-error を除くと 0行 0.0%）")
  })

  it("次の記録を持つ行だけを出し直しの分母にし、字数の比を出す", () => {
    expect(section).toContain(
      "次の呼び出しで通った 1／1行 100.0%（次の記録が無い 1行は分母から外した）",
    )
    expect(section).toContain("比 1.20")
    expect(section).toContain("次の呼び出しで通った 1／2行 50.0%")
  })

  it("差し戻しの連なりを受け付けで終わった長さで数える", () => {
    expect(section).toContain("2回 1連、受け付けに届かず終わったセッション 0")
    expect(section).toContain("なし、受け付けに届かず終わったセッション 1")
  })

  it("理由ごとの件数を側ごとに並べる", () => {
    expect(section).toMatch(/plain-word\s+2件\s+100\.0%\s+0件/)
    expect(section).toMatch(/tool-error\s+1件\s+50\.0%\s+2件\s+100\.0%/)
  })
})
