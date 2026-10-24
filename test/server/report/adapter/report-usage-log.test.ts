import { readdirSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { createReportUsageLog } from "../../../../src/server/report/adapter/report-usage-log.ts"
import type { ReportUsageEntry } from "../../../../src/server/report/core/report-usage.ts"
import { REPORT_USAGE_FORMAT_VERSION } from "../../../../src/shared/report/report-usage-record.ts"
import { keysOf, readJsonLines } from "../../../fixture/jsonl.ts"
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

function entry(
  when: number,
  sessionId = "claude-session-1",
  figure: ReportUsageEntry["figure"] = { figureKind: "none", noneReason: "short-answer" },
): ReportUsageEntry {
  return {
    at: when,
    sessionId,
    figure,
    shapeTags: {
      sectionShapeTags: ["cause", "unspecified"],
      sectionBlockKinds: [["table"], ["text"]],
      forbiddenShapeSectionCount: 1,
      forbiddenShapeBlocks: [{ shapeTag: "cause", blockKind: "table", count: 1 }],
    },
    blockKinds: ["text", "table"],
    blockFields: ["tableChange"],
    notations: ["list"],
    containedNotations: [],
    escapeNotations: [],
    unknownBlockCount: 0,
    listStyles: ["bullet"],
    mermaidKinds: [],
    hasModifiedFiles: true,
    hasBeforeAfterOrImage: false,
    forTask: true,
    hasFigure: true,
    readImageWithoutImageBlock: false,
    emphasisCount: 0,
    graphEdgeCount: 0,
    graphUnlabeledEdgeCount: 0,
    graphNodeCount: 0,
    hasUnverifiedCheck: false,
    hasHowToVerify: false,
    taskGenre: "decision",
    taskOutcome: "finished",
    hasFavor: false,
    hasSourceReference: true,
    shortTable: true,
    argumentChars: { total: 1200, fields: { conclusion: 40, sections: 900 } },
    inheritedFields: ["favor", "closing"],
  }
}

function readLines(fileName: string): unknown[] {
  return readJsonLines(join(root(), fileName))
}

describe("createReportUsageLog", () => {
  it("日付ごとのファイルに1行ずつ追記する", async () => {
    const log = createReportUsageLog("json-schema", "sdk", root())

    log.append(entry(at(9, 0), "claude-session-1"))
    log.append(entry(at(23, 30), "claude-session-2"))
    log.append(entry(at(1, 15, 23), "claude-session-3"))
    await log.flush()

    expect(readdirSync(root()).toSorted()).toEqual(["2026-09-22.jsonl", "2026-09-23.jsonl"])
    expect(readLines("2026-09-22.jsonl").length).toBe(2)
    expect(readLines("2026-09-23.jsonl").length).toBe(1)
  })

  it("1行の鍵は版・日時・セッションID・figure の種類と理由・節の札と許さない塊の数・塊の種類と欄・逃げ道の記法（外・容れ物の中・塊の無いもの）・知らない種類の数で、日時は ISO 8601（オフセット付き）", async () => {
    const log = createReportUsageLog("json-schema", "sdk", root())

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

  it("figure に図を置いた行は figureKind だけを持ち、noneReason を持たない", async () => {
    const log = createReportUsageLog("json-schema", "sdk", root())

    log.append(entry(at(9, 0), "claude-session-1", { figureKind: "graph" }))
    await log.flush()

    const [record] = readLines("2026-09-22.jsonl")
    expect(record).toMatchObject({ figureKind: "graph" })
    expect(keysOf(record)).not.toContain("noneReason")
  })

  it("差し戻しの行は同じ日付ファイルに入り、鍵は版・種類・日時・セッションID・差し戻しの名前・引数の字数・引き継いだ欄の名前・型の渡し方だけ", async () => {
    const log = createReportUsageLog("json-schema", "sdk", root())

    log.appendRejection({
      at: at(9, 5),
      sessionId: "claude-session-1",
      reasons: ["resend", "long-paragraph"],
      argumentChars: { total: 800, fields: { conclusion: 50 } },
      inheritedFields: ["sections"],
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

  it("短い型の表記で起こした記録は、受け付けと差し戻しの両方の行にそれを書く", async () => {
    const log = createReportUsageLog("short-type", "sdk", root())

    log.append(entry(at(9, 0)))
    log.appendRejection({
      at: at(9, 5),
      sessionId: "claude-session-1",
      reasons: ["tool-error"],
      argumentChars: { total: 800, fields: { conclusion: 50 } },
      inheritedFields: [],
    })
    await log.flush()

    expect(readLines("2026-09-22.jsonl")).toMatchObject([
      { reportSchema: "short-type" },
      { kind: "rejected", reportSchema: "short-type" },
    ])
  })
})
