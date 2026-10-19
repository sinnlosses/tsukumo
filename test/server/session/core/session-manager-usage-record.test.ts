import { describe, expect, it } from "vitest"

import type {
  ReportRejectionEntry,
  ReportUsageEntry,
} from "../../../../src/server/report/core/report-usage.ts"
import type { QuestionUsageEntry } from "../../../../src/server/session-driver/core/question-usage.ts"
import type { ReportSection } from "../../../../src/shared/report/report-block.ts"
import type { Question } from "../../../../src/shared/session-driver/question.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import { reportEvent } from "../../../fixture/report-event.ts"
import { createStubDriver } from "../../../fixture/session-driver.ts"
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
      const manager = createSessionManager({
        reportUsageLog: { append, appendRejection: rejected.append },
        launchSession: launchWith(stub),
      })
      return { manager, stub, entries, rejections: rejected.entries }
    }

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
            forbiddenShapeSectionCount: 0,
            forbiddenShapeBlocks: [],
          },
          blockKinds: ["text"],
          blockFields: [],
          notations: [],
          containedNotations: [],
          escapeNotations: [],
          unknownBlockCount: 0,
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
          argumentChars: { total: 0, fields: {} },
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
      stub.emit({ kind: "report-rejected", reasons: ["resend"], argumentChars: ARGUMENT_CHARS })
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
      })
      await waitForBatch()

      expect(rejections).toEqual([
        {
          at: 1_000,
          sessionId: "claude-session-1",
          reasons: ["resend", "long-paragraph"],
          argumentChars: ARGUMENT_CHARS,
        },
      ])
      expect(entries).toEqual([])
    })
  })

  // 質問（AskUserQuestion）の使われ方の記録。答えが確定した質問ごとに1行、選択肢の数と
  // preview の付いた数だけを書く（会話の文面は入らない）。
  describe("質問の使われ方の記録", () => {
    /** 答えが確定した質問の `SessionEvent`（中身はすべて手で書いた架空のもの）。 */
    function questionAnsweredEvent(
      questions: readonly Question[],
      briefed: readonly boolean[] = questions.map(() => false),
      sentBack = 0,
    ): SessionEvent {
      return {
        kind: "question-answered",
        toolUseId: "toolu_fictional",
        questions,
        answers: questions.map(() => ["架空の答え"]),
        briefed,
        sentBack,
      }
    }

    function question(optionCount: number, previewCount: number): Question {
      return {
        header: "架空の見出し",
        text: "架空の質問文",
        multiSelect: false,
        options: Array.from({ length: optionCount }, (_, index) => ({
          label: `架空の選択肢${index}`,
          description: "",
          preview: index < previewCount ? "架空のpreview" : undefined,
        })),
      }
    }

    function startQuestionUsageManagerWithStub() {
      const stub = createStubDriver()
      const { entries, append } = collector<QuestionUsageEntry>()
      const manager = createSessionManager({
        questionUsageLog: { append },
        launchSession: launchWith(stub),
      })
      return { manager, stub, entries }
    }

    it("答えが確定した質問ごとに、選択肢の数・preview の付いた数・添え書きの有無・断った回数を1行書く", async () => {
      const { stub, entries } = startQuestionUsageManagerWithStub()
      await waitForBatch()

      stub.emit(sessionInfo("claude-session-1"))
      stub.emit(questionAnsweredEvent([question(3, 1), question(2, 0)], [true, false], 2))
      await waitForBatch()

      expect(entries).toEqual([
        {
          at: 1_000,
          sessionId: "claude-session-1",
          optionCount: 3,
          previewCount: 1,
          briefed: true,
          sentBack: 2,
        },
        {
          at: 1_000,
          sessionId: "claude-session-1",
          optionCount: 2,
          previewCount: 0,
          briefed: false,
          sentBack: 0,
        },
      ])
    })

    it("claude 側のセッションIDが分からないうちは書かない", async () => {
      const { stub, entries } = startQuestionUsageManagerWithStub()
      await waitForBatch()

      stub.emit(questionAnsweredEvent([question(2, 0)]))
      await waitForBatch()

      expect(entries).toEqual([])
    })
  })
})
