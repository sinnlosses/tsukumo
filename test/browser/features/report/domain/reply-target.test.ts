import { describe, expect, it } from "vitest"

import { replyTargetOf } from "../../../../../src/browser/features/report/domain/reply-target.ts"
import { replyTargetSchema } from "../../../../../src/shared/session/reply-target.ts"

const base = {
  reportToolUseId: "toolu_1",
  componentId: "tbl",
  section: "架空の節",
  title: "架空の表",
  componentKind: "Table",
}

describe("replyTargetOf", () => {
  it("節・題・行から label と key を組む", () => {
    const target = replyTargetOf({ ...base, row: { index: 3, firstCell: "架空の行" } })
    expect(target).toEqual({
      label: { section: "架空の節", component: "架空の表", row: "架空の行" },
      key: { reportToolUseId: "toolu_1", componentId: "tbl", rowIndex: 3 },
    })
    expect(replyTargetSchema.safeParse(target).success).toBe(true)
  })

  it("節の無い部品・行の無い部品は欄を省く", () => {
    const target = replyTargetOf({ ...base, section: "" })
    expect(target.label).toEqual({ component: "架空の表" })
    expect(target.key).toEqual({ reportToolUseId: "toolu_1", componentId: "tbl" })
  })

  it("題が空なら部品の種類の名前を使う", () => {
    expect(replyTargetOf({ ...base, title: "" }).label.component).toBe("Table")
  })

  it("行の添字は0でも残り、1列目が空なら row を省く", () => {
    const target = replyTargetOf({ ...base, row: { index: 0, firstCell: "  " } })
    expect(target.key.rowIndex).toBe(0)
    expect(target.label.row).toBeUndefined()
  })

  it("印を素の字に畳み、上限を超える字を切る", () => {
    const target = replyTargetOf({
      ...base,
      title: "所要 {{12 → 8}}",
      section: "あ".repeat(600),
    })
    expect(target.label.component).toBe("所要 12 → 8")
    expect([...(target.label.section ?? "")]).toHaveLength(500)
  })
})
