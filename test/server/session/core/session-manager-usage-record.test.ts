import { describe, expect, it } from "vitest"

import type {
  ReportFollowUpEntry,
  ReportRejectionEntry,
  ReportUsageEntry,
} from "../../../../src/server/report/core/report-usage.ts"
import type { ReportSection } from "../../../../src/shared/report/report-block.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import { reportEvent } from "../../../fixture/report-event.ts"
import { createStubDriver } from "../../../fixture/session-driver.ts"
import { requestEvent } from "../../../fixture/session-event.ts"
import { collector, launchWith, sessionInfo } from "../../../fixture/session-manager-record.ts"
import { createSessionManager, waitForBatch } from "../../../fixture/session-manager.ts"

/** 差し戻した `report` の引数の字数（架空の値）。 */
const ARGUMENT_CHARS = { total: 120, fields: { conclusion: 30 } } as const

describe("createSessionManager", () => {
  // `report` の塊の使われ方の記録。描いた（差し戻されなかった）report だけが1行になることを
  // ここで固定する（docs/research/report-block.md「回し方（数えて足す・外す）」）。
  describe("report の塊の使われ方の記録", () => {
    /** 描いた `report` の `SessionEvent`（中身はすべて手で書いた架空のもの）。 */
    function reportWithSections(
      sections: readonly ReportSection[],
      unknownBlockCount = 0,
    ): SessionEvent {
      return reportEvent({
        toolUseId: "toolu_r1",
        conclusion: "架空の結論。",
        sections,
        unknownBlockCount,
      })
    }

    function startReportUsageManagerWithStub() {
      const stub = createStubDriver()
      const { entries, append } = collector<ReportUsageEntry>()
      const rejected = collector<ReportRejectionEntry>()
      const followed = collector<ReportFollowUpEntry>()
      const manager = createSessionManager({
        reportUsageLog: {
          append,
          appendRejection: rejected.append,
          appendFollowUp: followed.append,
        },
        launchSession: launchWith(stub),
      })
      return { manager, stub, entries, rejections: rejected.entries, followUps: followed.entries }
    }

    it("依頼が届くと、聞き直しか否かの真偽だけを時刻・セッションIDとともに渡す", async () => {
      const { stub, followUps } = startReportUsageManagerWithStub()
      await waitForBatch()

      stub.emit(sessionInfo("claude-session-1"))
      stub.emit(requestEvent("もう一度架空の話を"))
      await waitForBatch()

      expect(followUps).toEqual([
        { at: expect.any(Number), sessionId: "claude-session-1", restated: true },
      ])
    })

    it("描いた report のたびに、塊の種類と時刻・セッションIDを1行書く", async () => {
      const { stub, entries } = startReportUsageManagerWithStub()
      await waitForBatch()

      stub.emit(sessionInfo("claude-session-1"))
      stub.emit(
        reportWithSections([
          {
            heading: "",
            shapeTag: "unspecified",
            blocks: [{ kind: "text", text: "架空の根拠。", fold: "", aside: "" }],
          },
        ]),
      )
      await waitForBatch()

      expect(entries).toEqual([
        {
          at: 1_000,
          sessionId: "claude-session-1",
          figure: { figureKind: "none", noneReason: "unrecorded" },
          shapeTags: {
            sectionShapeTags: ["unspecified"],
            sectionBlockKinds: [["text"]],
            forbiddenShapeSectionCount: 0,
            forbiddenShapeBlocks: [],
          },
          blockKinds: ["text"],
          blockFields: [],
          notations: [],
          containedNotations: [],
          escapeNotations: [],
          componentNames: [],
          markdownNotationKinds: [],
          unknownBlockCount: 0,
          brokenFenceCount: 0,
          listStyles: [],
          mermaidKinds: [],
          hasModifiedFiles: false,
          hasBeforeAfterOrImage: false,
          forTask: false,
          hasFigure: false,
          readImageWithoutImageBlock: false,
          emphasisCount: 0,
          graphEdgeCount: 0,
          graphUnlabeledEdgeCount: 0,
          graphNodeCount: 0,
          hasUnverifiedCheck: false,
          hasHowToVerify: false,
          taskGenre: "none",
          taskOutcome: "none",
          hasFavor: false,
          hasSourceReference: false,
          shortTable: false,
          hasKeyFigures: false,
          conclusionNumbersWithoutKeyFigures: false,
          argumentChars: { total: 0, fields: {} },
          inheritedFields: [],
          sessionSummary: undefined,
        },
      ])
    })

    describe("画像を読んだのに image が無い回", () => {
      const textOnly = (): SessionEvent =>
        reportWithSections([
          {
            heading: "",
            shapeTag: "unspecified",
            blocks: [{ kind: "text", text: "架空の根拠。", fold: "", aside: "" }],
          },
        ])
      const readStarted = (parentToolUseId: string | undefined): SessionEvent => ({
        kind: "tool-started",
        toolUseId: "toolu_read",
        name: "Read",
        input: { file_path: "/tmp/fictional.png" },
        parentToolUseId,
      })

      it("メインが画像を Read したターンの report は真で、turn-finished のあとのターンは偽に戻る", async () => {
        const { stub, entries } = startReportUsageManagerWithStub()
        await waitForBatch()

        stub.emit(sessionInfo("claude-session-1"))
        stub.emit(readStarted(undefined))
        stub.emit(textOnly())
        stub.emit({ kind: "turn-finished", outcome: { kind: "completed" } })
        stub.emit(textOnly())
        await waitForBatch()

        expect(entries.map((entry) => entry.readImageWithoutImageBlock)).toEqual([true, false])
      })

      it("サブエージェントの Read は数えない", async () => {
        const { stub, entries } = startReportUsageManagerWithStub()
        await waitForBatch()

        stub.emit(sessionInfo("claude-session-1"))
        stub.emit(readStarted("toolu_parent"))
        stub.emit(textOnly())
        await waitForBatch()

        expect(entries.map((entry) => entry.readImageWithoutImageBlock)).toEqual([false])
      })
    })

    it("claude 側のセッションIDが分からないうちは書かない", async () => {
      const { stub, entries, rejections } = startReportUsageManagerWithStub()
      await waitForBatch()

      stub.emit(reportWithSections([]))
      stub.emit({
        kind: "report-rejected",
        reasons: ["resend"],
        argumentChars: ARGUMENT_CHARS,
        inheritedFields: [],
        toolErrorFields: [],
      })
      await waitForBatch()

      expect(entries).toEqual([])
      expect(rejections).toEqual([])
    })

    it("差し戻した report は、種類の名前と時刻・セッションIDだけを差し戻しの行として書く", async () => {
      const { stub, entries, rejections } = startReportUsageManagerWithStub()
      await waitForBatch()

      stub.emit(sessionInfo("claude-session-1"))
      stub.emit({
        kind: "report-rejected",
        reasons: ["resend", "long-paragraph"],
        argumentChars: ARGUMENT_CHARS,
        inheritedFields: ["favor"],
        toolErrorFields: [],
      })
      await waitForBatch()

      expect(rejections).toEqual([
        {
          mode: "reject",
          at: 1_000,
          sessionId: "claude-session-1",
          reasons: ["resend", "long-paragraph"],
          argumentChars: ARGUMENT_CHARS,
          inheritedFields: ["favor"],
          toolErrorFields: [],
        },
      ])
      expect(entries).toEqual([])
    })

    it("数えるだけの条に当たった report は、同じ口に count の件として書く", async () => {
      const { stub, entries, rejections } = startReportUsageManagerWithStub()
      await waitForBatch()

      stub.emit(sessionInfo("claude-session-1"))
      stub.emit({
        kind: "report-counted",
        reasons: ["long-code"],
        argumentChars: ARGUMENT_CHARS,
        inheritedFields: [],
      })
      await waitForBatch()

      expect(rejections).toEqual([
        {
          mode: "count",
          at: 1_000,
          sessionId: "claude-session-1",
          reasons: ["long-code"],
          argumentChars: ARGUMENT_CHARS,
          inheritedFields: [],
          toolErrorFields: [],
        },
      ])
      expect(entries).toEqual([])
    })
  })
})
