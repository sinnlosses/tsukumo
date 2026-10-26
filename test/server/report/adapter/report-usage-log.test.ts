import { readdirSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { createReportUsageLog } from "../../../../src/server/report/adapter/report-usage-log.ts"
import { REPORT_USAGE_FORMAT_VERSION } from "../../../../src/shared/report/report-usage-record.ts"
import { keysOf, readJsonLines } from "../../../fixture/jsonl.ts"
import { expectEveryFieldKept } from "../../../fixture/record-field.ts"
import { reportUsageEntry as entry } from "../../../fixture/report-usage-entry.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

const dir = useTempDir("report-usage")

/** 書き込み先（本物の `~/.tsukumo/report-usage` の代わり）。 */
function root(): string {
  return join(dir(), "report-usage")
}

/** ある日のローカル時刻のエポックミリ秒（日をまたぐ心配をしない値）。 */
function at(hour: number, minute: number, day = 22): number {
  return Temporal.ZonedDateTime.from({
    year: 2026,
    month: 9,
    day,
    hour,
    minute,
    second: 0,
    timeZone: Temporal.Now.timeZoneId(),
  }).epochMilliseconds
}

function readLines(fileName: string): unknown[] {
  return readJsonLines(join(root(), fileName))
}

describe("createReportUsageLog", () => {
  it("日付ごとのファイルに1行ずつ追記する", async () => {
    const log = createReportUsageLog("json-schema", root())

    log.append(entry(at(9, 0), "claude-session-1"))
    log.append(entry(at(23, 30), "claude-session-2"))
    log.append(entry(at(1, 15, 23), "claude-session-3"))
    await log.flush()

    expect(readdirSync(root()).toSorted()).toEqual(["2026-09-22.jsonl", "2026-09-23.jsonl"])
    expect(readLines("2026-09-22.jsonl").length).toBe(2)
    expect(readLines("2026-09-23.jsonl").length).toBe(1)
  })

  it("1行の鍵は版・日時・セッションID・figure の種類と理由・節の札と許さない塊の数・塊の種類と欄・逃げ道の記法（外・容れ物の中・塊の無いもの）・知らない種類の数で、日時は ISO 8601（オフセット付き）", async () => {
    const log = createReportUsageLog("json-schema", root())

    log.append(entry(at(9, 0)))
    await log.flush()

    const [record] = readLines("2026-09-22.jsonl")
    expect(keysOf(record)).toEqual([
      "v",
      "at",
      "sessionId",
      "driver",
      "figureKind",
      "noneReason",
      "sectionShapeTags",
      "sectionBlockKinds",
      "forbiddenShapeSectionCount",
      "forbiddenShapeBlocks",
      "blockKinds",
      "blockFields",
      "notations",
      "containedNotations",
      "escapeNotations",
      "unknownBlockCount",
      "listStyles",
      "mermaidKinds",
      "hasModifiedFiles",
      "hasBeforeAfterOrImage",
      "forTask",
      "hasFigure",
      "readImageWithoutImageBlock",
      "emphasisCount",
      "graphEdgeCount",
      "graphUnlabeledEdgeCount",
      "graphNodeCount",
      "hasUnverifiedCheck",
      "hasHowToVerify",
      "taskGenre",
      "taskOutcome",
      "hasFavor",
      "hasSourceReference",
      "shortTable",
      "hasKeyFigures",
      "conclusionNumbersWithoutKeyFigures",
      "argumentChars",
      "inheritedFields",
      "reportSchema",
    ])
    expect(record).toMatchObject({
      v: REPORT_USAGE_FORMAT_VERSION,
      sessionId: "claude-session-1",
      figureKind: "none",
      noneReason: "short-answer",
      driver: "sdk",
      sectionShapeTags: ["cause", "unspecified"],
      sectionBlockKinds: [["table"], ["text"]],
      forbiddenShapeSectionCount: 1,
      forbiddenShapeBlocks: [{ shapeTag: "cause", blockKind: "table", count: 1 }],
      listStyles: ["bullet"],
      mermaidKinds: [],
      blockKinds: ["text", "table"],
      blockFields: ["tableChange"],
      notations: ["list"],
      containedNotations: [],
      escapeNotations: [],
      unknownBlockCount: 0,
      hasModifiedFiles: true,
      hasBeforeAfterOrImage: false,
      forTask: true,
      hasFigure: true,
      readImageWithoutImageBlock: false,
      taskGenre: "decision",
      taskOutcome: "finished",
      hasFavor: false,
      hasSourceReference: true,
      shortTable: true,
      argumentChars: { total: 1200, fields: { conclusion: 40, sections: 900 } },
      inheritedFields: ["favor", "closing"],
      reportSchema: "json-schema",
    })
    // オフセットはそのマシンのローカル時刻で決まるので、頭だけを見る。
    expect(JSON.stringify(record)).toMatch(/"at":"2026-09-22T09:00:00[+-]\d{2}:\d{2}"/)
  })

  it("渡された件の欄は、図と節の札の欄を平らに広げたうえで、入れ子の中まで全部行に残る", async () => {
    const log = createReportUsageLog("json-schema", root())
    const { figure, shapeTags, ...rest } = entry(at(9, 0))

    log.append(entry(at(9, 0)))
    await log.flush()

    const lines = readLines("2026-09-22.jsonl")
    expect(lines).toHaveLength(1)
    expectEveryFieldKept({ ...figure, ...shapeTags, ...rest }, lines[0])
  })

  it("差し戻しの件の欄は全部行に残る", async () => {
    const log = createReportUsageLog("json-schema", root())
    const rejection = {
      mode: "reject",
      at: at(9, 5),
      sessionId: "claude-session-1",
      reasons: ["resend"],
      argumentChars: { total: 800, fields: { conclusion: 50 } },
      inheritedFields: ["sections"],
      toolErrorFields: [{ field: "sections.n.kind", code: "invalid_union" }],
    } as const

    log.appendRejection(rejection)
    await log.flush()

    const lines = readLines("2026-09-22.jsonl")
    expect(lines).toHaveLength(1)
    // `mode` は行の `kind` に写る。
    expectEveryFieldKept(rejection, lines[0], ["mode"])
  })

  describe("差し戻しの次の呼び出し", () => {
    const rejection = (reasons: readonly string[], minute: number) =>
      ({
        mode: "reject",
        at: at(9, minute),
        sessionId: "claude-session-1",
        reasons,
        argumentChars: { total: 800, fields: {} },
        inheritedFields: [],
        toolErrorFields: [],
      }) as const

    it("差し戻しのあとに受け付けた呼び出しが来ると、差し戻しの行に空の理由と次の字数が付く", async () => {
      const log = createReportUsageLog("json-schema", root())

      log.appendRejection(rejection(["resend"], 5))
      log.append({ ...entry(at(9, 6)), argumentChars: { total: 300, fields: {} } })
      await log.flush()

      expect(readLines("2026-09-22.jsonl")).toMatchObject([
        { kind: "rejected", nextCall: { reasons: [], chars: 300 } },
        { sessionId: "claude-session-1" },
      ])
    })

    it("同じ理由で2回差し戻されると、1回目の行には2回目の理由が付き、2回目の行には次が付かない", async () => {
      const log = createReportUsageLog("json-schema", root())

      log.appendRejection(rejection(["resend"], 5))
      log.appendRejection({
        ...rejection(["resend"], 6),
        argumentChars: { total: 500, fields: {} },
      })
      await log.flush()

      const [first, second] = readLines("2026-09-22.jsonl")
      expect(first).toMatchObject({ nextCall: { reasons: ["resend"], chars: 500 } })
      expect(second).not.toHaveProperty("nextCall")
    })

    it("別のセッションの呼び出しは、待っている差し戻しの次に数えない", async () => {
      const log = createReportUsageLog("json-schema", root())

      log.appendRejection(rejection(["resend"], 5))
      log.append(entry(at(9, 6), "claude-session-2"))
      await log.flush()

      const lines = readLines("2026-09-22.jsonl")
      expect(lines).toHaveLength(2)
      expect(lines[1]).toMatchObject({ kind: "rejected" })
      expect(lines[1]).not.toHaveProperty("nextCall")
    })
  })

  it("数えるだけの条の件は、差し戻しの行と同じ形の counted の行になる", async () => {
    const log = createReportUsageLog("json-schema", root())

    log.appendRejection({
      mode: "count",
      at: at(9, 5),
      sessionId: "claude-session-1",
      reasons: ["long-code"],
      argumentChars: { total: 800, fields: { conclusion: 50 } },
      inheritedFields: [],
      toolErrorFields: [],
    })
    await log.flush()

    expect(readLines("2026-09-22.jsonl")).toMatchObject([
      { v: REPORT_USAGE_FORMAT_VERSION, kind: "counted", reasons: ["long-code"] },
    ])
  })

  it("保持の日数が無いので、掃除しても古い日付のファイルは消えない", async () => {
    const log = createReportUsageLog("json-schema", root())
    log.append(entry(at(9, 0)))
    await log.flush()

    log.pruneExpired("2030-01-01")

    expect(readdirSync(root())).toEqual(["2026-09-22.jsonl"])
  })

  it("figure に図を置いた行は figureKind だけを持ち、noneReason を持たない", async () => {
    const log = createReportUsageLog("json-schema", root())

    log.append(entry(at(9, 0), "claude-session-1", { figureKind: "graph" }))
    await log.flush()

    const [record] = readLines("2026-09-22.jsonl")
    expect(record).toMatchObject({ figureKind: "graph" })
    expect(keysOf(record)).not.toContain("noneReason")
  })

  it("差し戻しの行は同じ日付ファイルに入り、鍵は版・種類・日時・セッションID・差し戻しの名前・引数の字数・引き継いだ欄の名前・型の渡し方だけ", async () => {
    const log = createReportUsageLog("json-schema", root())

    log.appendRejection({
      mode: "reject",
      at: at(9, 5),
      sessionId: "claude-session-1",
      reasons: ["resend", "long-paragraph"],
      argumentChars: { total: 800, fields: { conclusion: 50 } },
      inheritedFields: ["sections"],
      toolErrorFields: [],
    })
    await log.flush()

    const [record] = readLines("2026-09-22.jsonl")
    expect(keysOf(record)).toEqual([
      "v",
      "kind",
      "at",
      "sessionId",
      "driver",
      "reasons",
      "argumentChars",
      "inheritedFields",
      "reportSchema",
    ])
    expect(record).toMatchObject({
      v: REPORT_USAGE_FORMAT_VERSION,
      kind: "rejected",
      sessionId: "claude-session-1",
      reasons: ["resend", "long-paragraph"],
      argumentChars: { total: 800, fields: { conclusion: 50 } },
      inheritedFields: ["sections"],
      reportSchema: "json-schema",
    })
  })

  it("形の検査で落ちた欄があれば、差し戻しの行に欄名と code だけを書く", async () => {
    const log = createReportUsageLog("json-schema", root())

    log.appendRejection({
      mode: "reject",
      at: at(9, 5),
      sessionId: "claude-session-1",
      reasons: ["tool-error"],
      argumentChars: { total: 800, fields: {} },
      inheritedFields: [],
      toolErrorFields: [{ field: "sections.n.blocks.n.kind", code: "invalid_union" }],
    })
    await log.flush()

    const [record] = readLines("2026-09-22.jsonl")
    expect(record).toMatchObject({
      toolErrorFields: [{ field: "sections.n.blocks.n.kind", code: "invalid_union" }],
    })
  })

  it("短い型の表記で起こした記録は、受け付けと差し戻しの両方の行にそれを書く", async () => {
    const log = createReportUsageLog("short-type", root())

    log.append(entry(at(9, 0)))
    log.appendRejection({
      mode: "reject",
      at: at(9, 5),
      sessionId: "claude-session-1",
      reasons: ["tool-error"],
      argumentChars: { total: 800, fields: { conclusion: 50 } },
      inheritedFields: [],
      toolErrorFields: [],
    })
    await log.flush()

    expect(readLines("2026-09-22.jsonl")).toMatchObject([
      { reportSchema: "short-type" },
      { kind: "rejected", reportSchema: "short-type" },
    ])
  })
})
