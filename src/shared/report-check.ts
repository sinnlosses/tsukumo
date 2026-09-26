// `report` の検証結果の欄 `checks`（docs/glossary.md「検証結果」）。形の出どころはここだけで、
// handler の検査（`src/server/session-driver/adapter/sdk-tool.ts`）と、呼び出しをイベントに変える側
// （`src/server/session-driver/core/sdk-message.ts`）が同じ形を引く。描くのはメインビューの組み立て
// （`src/shared/main-view.ts`）で、ここの {@link reportChecksMarkdown} が帯の HTML を組む。

import { z } from "zod"

/** 検証1項目の状態。確かめなかった・飛ばしたものは `unverified` にまとめ、理由は `detail` に書かせる。 */
export const REPORT_CHECK_STATUSES = ["ok", "ng", "unverified"] as const

export type ReportCheckStatus = (typeof REPORT_CHECK_STATUSES)[number]

export const reportCheckSchema = z.object({
  status: z.enum(REPORT_CHECK_STATUSES),
  label: z.string().describe("何で確かめたか（コマンド・テスト・手で見た場面）"),
  detail: z.string().describe("件数・差分・確かめなかった理由など。無ければ空文字"),
})

export type ReportCheck = z.infer<typeof reportCheckSchema>

/**
 * `report` の引数の `checks` を取り出す。「無い」と形の崩れは空の配列に畳む（形の崩れた
 * 呼び出しは handler に届く前に SDK が差し戻すので、描かれない）。
 */
export function parseReportChecks(value: unknown): readonly ReportCheck[] {
  const parsed = z.array(reportCheckSchema).safeParse(value)
  return parsed.success ? parsed.data : []
}

/**
 * 検証結果の帯（1行の HTML）。空なら空文字。状態はバッジの色と文字の両方で見せる
 * （色だけで意味を伝えない。docs/screen-design.md 13.1 原則5）。`label` / `detail` はモデルが
 * 書いた文字列なので HTML として逃がし、改行は空白に畳む（HTML の塊が空行で切れないように）。
 */
export function reportChecksMarkdown(checks: readonly ReportCheck[]): string {
  if (checks.length === 0) {
    return ""
  }
  const items = checks.map(({ status, label, detail }) => {
    const mark = REPORT_CHECK_MARKS[status]
    const parts = [
      `<span class="badge ${mark.badge}">${mark.text}</span>`,
      `<b>${inlineText(label)}</b>`,
      ...(detail.trim() === "" ? [] : [inlineText(detail)]),
    ]
    return `<div class="check">${parts.join(" ")}</div>`
  })
  return `<div class="checks">${items.join("")}</div>`
}

/** 状態 → 帯に描くバッジ（記法の `badge-*`）と文字。 */
const REPORT_CHECK_MARKS = {
  ok: { badge: "badge-ok", text: "OK" },
  ng: { badge: "badge-ng", text: "NG" },
  unverified: { badge: "badge-warn", text: "未確認" },
} as const satisfies Record<ReportCheckStatus, { readonly badge: string; readonly text: string }>

function inlineText(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}
