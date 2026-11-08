import { describe, expect, it } from "vitest"

import { outlineReportOf } from "../../../../../../src/browser/components/page/conversation/domain/outline-report-row.ts"
import {
  replyBatchDraftOf,
  reportTitleLookup,
  type ReportTitleOf,
} from "../../../../../../src/browser/components/page/conversation/domain/reply-batch-draft.ts"
import type { ReplyNote } from "../../../../../../src/browser/stores/reply-note-list.ts"
import { ask, finished, report, turnOf } from "../../../../../fixture/main-view-report.ts"

type NoteInit = {
  readonly id: string
  readonly body: string
  readonly reportId?: string
  readonly section?: string
  readonly row?: string
}

function noteOf(init: NoteInit): ReplyNote {
  return {
    id: init.id,
    body: init.body,
    state: { kind: "unsent" },
    target: {
      label: { section: init.section, component: `部品${init.id}`, row: init.row },
      key: { reportToolUseId: init.reportId ?? "r1", componentId: init.id },
    },
  }
}

const titles: Record<string, string> = { r1: "架空の見出し", r2: "別の見出し" }
const titleOf: ReportTitleOf = (id) => titles[id] ?? ""

function numberedLines(text: string): readonly string[] {
  return text.split("\n").filter((line) => /^\d+\. /.test(line))
}

describe("replyBatchDraftOf", () => {
  it("1件のとき、見出し付きの1行目と番号付きの行になる", () => {
    const text = replyBatchDraftOf([noteOf({ id: "a", body: "進めて。" })], titleOf)
    expect(text).toBe(
      [
        "レポート「架空の見出し」への頼みごと 1 件。この順に進めて。",
        "",
        "1. 部品a",
        "   進めて。",
      ].join("\n"),
    )
  })

  it("3件は渡された順に番号が付き、section と row のある所は › でつなぐ", () => {
    const notes = [
      noteOf({ id: "a", body: "一" }),
      noteOf({ id: "b", body: "二", section: "節", row: "行" }),
      noteOf({ id: "c", body: "三" }),
    ]
    const lines = numberedLines(replyBatchDraftOf(notes, titleOf))
    expect(lines).toEqual(["1. 部品a", "2. 節 › 部品b › 行", "3. 部品c"])
  })

  it("中身が複数行なら各行を字下げする", () => {
    const text = replyBatchDraftOf([noteOf({ id: "a", body: "一行目\n二行目" })], titleOf)
    expect(text).toContain("   一行目\n   二行目")
  })

  it("別のレポートの付箋が混じると、1行目から見出しを外し指した所の頭へ足す", () => {
    const notes = [noteOf({ id: "a", body: "一" }), noteOf({ id: "b", body: "二", reportId: "r2" })]
    const text = replyBatchDraftOf(notes, titleOf)
    expect(text.split("\n")[0]).toBe("レポートへの頼みごと 2 件。この順に進めて。")
    expect(numberedLines(text)).toEqual(["1. 架空の見出し › 部品a", "2. 別の見出し › 部品b"])
  })

  it("見出しが引けない付箋は見出しを省く", () => {
    const text = replyBatchDraftOf([noteOf({ id: "a", body: "一", reportId: "none" })], titleOf)
    expect(text.split("\n")[0]).toBe("レポートへの頼みごと 1 件。この順に進めて。")
    expect(numberedLines(text)).toEqual(["1. 部品a"])
  })

  it("入力の付箋の数だけ番号の行が出る", () => {
    const notes = ["a", "b", "c", "d"].map((id) => noteOf({ id, body: id }))
    const text = replyBatchDraftOf(notes, titleOf)
    expect(numberedLines(text)).toHaveLength(notes.length)
    for (const note of notes) {
      expect(text).toContain(`部品${note.id}`)
    }
  })

  it("行を1つ飛ばした出力は、付箋の数との照合で落ちる", () => {
    const notes = ["a", "b", "c"].map((id) => noteOf({ id, body: id }))
    const broken = numberedLines(replyBatchDraftOf(notes, titleOf)).slice(1)
    expect(broken).not.toHaveLength(notes.length)
  })
})

describe("reportTitleLookup", () => {
  it("report ツールのステップを持つやり取りの題を、その toolUseId で引く", () => {
    const turn = turnOf(
      [ask, report("架空の結論"), finished],
      { report: false, utterance: false },
      true,
    )
    expect(turn).toBeDefined()
    if (turn === undefined) return
    const outline = outlineReportOf(turn)
    expect(outline.kind).toBe("report")
    const lookup = reportTitleLookup([turn])
    expect(lookup("toolu_r1")).toBe(outline.kind === "report" ? outline.title : "")
    expect(lookup("toolu_r1")).not.toBe("")
    expect(lookup("toolu_zzz")).toBe("")
  })
})
