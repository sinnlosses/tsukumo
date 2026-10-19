import { describe, expect, it } from "vitest"

import type {
  ChatArchive,
  ChatArchiveEntry,
  ChatArchiveImageWriteResult,
} from "../../../../src/server/chat/core/chat-archive-port.ts"
import { createPromptImageShelf } from "../../../../src/server/session-driver/core/prompt-image-shelf.ts"
import type { DiagnosticEntry } from "../../../../src/shared/diagnostic/diagnostic-record.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import { NOOP_CHAT_ARCHIVE } from "../../../fixture/chat.ts"
import { reportEvent } from "../../../fixture/report-event.ts"
import { createStubDriver } from "../../../fixture/session-driver.ts"
import { launchWith } from "../../../fixture/session-manager-record.ts"
import {
  CHARACTER_EVENT,
  createSessionManager,
  FICTIONAL_PROJECT,
  waitForBatch,
} from "../../../fixture/session-manager.ts"

describe("createSessionManager", () => {
  describe("会話のアーカイブ", () => {
    // `chatArchive` の実装（ファイルI/O）は adapter のテストが持つ。ここで見るのは
    // 「いつ・何を渡すか」（`recordSessionEvent` の分岐）だけ
    // （docs/architecture/chat-mode.md「会話のアーカイブ」）。

    /** `report` の `SessionEvent`（結論だけ差し替えられる。中身はすべて手で書いた架空のもの）。 */
    function reportWithConclusion(conclusion: string): SessionEvent {
      return reportEvent({
        toolUseId: "toolu_r1",
        conclusion,
        sections: [
          {
            heading: "",
            shapeTag: "unspecified",
            blocks: [{ kind: "text", text: "本文はここに出ない", fold: "", aside: "" }],
          },
        ],
        favor: "本文はここに出ない",
        checks: [
          {
            status: "ok",
            label: "本文はここに出ない",
            figure: "",
            command: "",
            detail: "",
            howToVerify: "",
          },
        ],
      })
    }

    function startArchiveManagerWithStub() {
      const stub = createStubDriver()
      const archiveCalls: { readonly packName: string; readonly entry: ChatArchiveEntry }[] = []
      const chatArchive: ChatArchive = {
        ...NOOP_CHAT_ARCHIVE,
        append: (packName, entry) => {
          archiveCalls.push({ packName, entry })
        },
      }
      const manager = createSessionManager({
        chatArchive,
        launchSession: (onEvent, onRestoredEvents) => {
          stub.attach(onEvent)
          stub.attachRestored(onRestoredEvents)
          return Promise.resolve(stub.driver)
        },
      })
      return { manager, stub, archiveCalls }
    }

    it("雑談で駆動から届いた依頼とセリフが、表情つきで1行ずつアーカイブへ渡る", async () => {
      const { stub, archiveCalls } = startArchiveManagerWithStub()
      await waitForBatch()

      stub.emit(CHARACTER_EVENT)
      stub.emit({ kind: "chat-mode-changed", chat: true })
      stub.emit({ kind: "request", text: "架空の依頼", images: [] })
      stub.emit({ kind: "speech", text: "架空のセリフ", expression: "proud" })
      await waitForBatch()

      expect(archiveCalls).toEqual([
        {
          packName: "fictional",
          entry: {
            mode: "chat",
            kind: "request",
            at: 1_000,
            text: "架空の依頼",
            images: undefined,
          },
        },
        {
          packName: "fictional",
          entry: {
            mode: "chat",
            kind: "speech",
            at: 1_000,
            text: "架空のセリフ",
            expression: "proud",
          },
        },
      ])
    })

    it("仕事のときも、依頼とセリフが project つきでアーカイブへ渡る", async () => {
      const { stub, archiveCalls } = startArchiveManagerWithStub()
      await waitForBatch()

      stub.emit(CHARACTER_EVENT)
      stub.emit({ kind: "request", text: "架空の依頼", images: [] })
      stub.emit({ kind: "speech", text: "架空のセリフ", expression: "default" })
      await waitForBatch()

      expect(archiveCalls).toEqual([
        {
          packName: "fictional",
          entry: {
            mode: "work",
            kind: "request",
            at: 1_000,
            text: "架空の依頼",
            project: FICTIONAL_PROJECT,
            images: undefined,
          },
        },
        {
          packName: "fictional",
          entry: {
            mode: "work",
            kind: "speech",
            at: 1_000,
            text: "架空のセリフ",
            project: FICTIONAL_PROJECT,
            expression: "default",
          },
        },
      ])
    })

    it("そのターンで最後に届いた report の結論が、turn-finished で1行になる", async () => {
      const { stub, archiveCalls } = startArchiveManagerWithStub()
      await waitForBatch()

      stub.emit(CHARACTER_EVENT)
      stub.emit(reportWithConclusion("途中の結論"))
      stub.emit(reportWithConclusion("最後の結論"))
      await waitForBatch()
      // report だけではまだ書かない（turn-finished でどれを書くか決まる）。
      expect(archiveCalls).toEqual([])

      stub.emit({ kind: "turn-finished", outcome: { kind: "completed" } })
      await waitForBatch()

      expect(archiveCalls).toEqual([
        {
          packName: "fictional",
          entry: {
            mode: "work",
            kind: "conclusion",
            at: 1_000,
            text: "最後の結論",
            project: FICTIONAL_PROJECT,
          },
        },
      ])
    })

    it("report 無しで終わったターンは、結論を何も足さない", async () => {
      const { stub, archiveCalls } = startArchiveManagerWithStub()
      await waitForBatch()

      stub.emit(CHARACTER_EVENT)
      stub.emit({ kind: "turn-finished", outcome: { kind: "completed" } })
      await waitForBatch()

      expect(archiveCalls).toEqual([])
    })
  })

  describe("雑談の画像", () => {
    /** 合成のバイト列（3バイト）の data URL。実物の画像は使わない。 */
    const SYNTHETIC_DATA_URL = "data:image/png;base64,AQID"

    function startImageManagerWithStub(writeResult: ChatArchiveImageWriteResult) {
      const stub = createStubDriver()
      const promptImageShelf = createPromptImageShelf()
      const [shelved] = promptImageShelf.shelve([
        { full: SYNTHETIC_DATA_URL, thumbnail: SYNTHETIC_DATA_URL },
      ])
      const writes: { readonly id: string; readonly dataUrl: string }[] = []
      const archiveCalls: ChatArchiveEntry[] = []
      const diagnostics: DiagnosticEntry[] = []
      createSessionManager({
        promptImageShelf,
        chatArchive: {
          ...NOOP_CHAT_ARCHIVE,
          append: (_packName, entry) => {
            archiveCalls.push(entry)
          },
          writeImage: (_packName, image) => {
            writes.push({ id: image.id, dataUrl: image.dataUrl })
            return writeResult
          },
        },
        diagnosticLog: {
          append: (entries) => {
            diagnostics.push(...entries)
          },
          readRange: () => [],
        },
        launchSession: launchWith(stub),
      })
      const request: SessionEvent = {
        kind: "request",
        text: "架空の依頼",
        images: shelved === undefined ? [] : [{ id: shelved.id, thumbnail: shelved.thumbnail }],
      }
      return { stub, request, shelvedId: shelved?.id, writes, archiveCalls, diagnostics }
    }

    it("雑談で届いた依頼の画像は、棚の原寸を書き、書けた名前が行に載る", async () => {
      const { stub, request, shelvedId, writes, archiveCalls } = startImageManagerWithStub({
        kind: "written",
        fileName: "2026-10-20-fictional.png",
      })
      await waitForBatch()

      stub.emit(CHARACTER_EVENT)
      stub.emit({ kind: "chat-mode-changed", chat: true })
      stub.emit(request)
      await waitForBatch()

      expect(writes).toEqual([{ id: shelvedId, dataUrl: SYNTHETIC_DATA_URL }])
      expect(archiveCalls[0]).toMatchObject({
        mode: "chat",
        images: 1,
        imageFiles: ["2026-10-20-fictional.png"],
      })
    })

    it("仕事で届いた依頼の画像は書かない", async () => {
      const { stub, request, writes } = startImageManagerWithStub({
        kind: "written",
        fileName: "2026-10-20-fictional.png",
      })
      await waitForBatch()

      stub.emit(CHARACTER_EVENT)
      stub.emit(request)
      await waitForBatch()

      expect(writes).toEqual([])
    })

    it("書けなかった画像は、名前と error.name だけの足跡で診断に出て、行は書く", async () => {
      const { stub, request, archiveCalls, diagnostics } = startImageManagerWithStub({
        kind: "failed",
        error: new Error("架空の書き損じ"),
      })
      await waitForBatch()

      stub.emit(CHARACTER_EVENT)
      stub.emit({ kind: "chat-mode-changed", chat: true })
      stub.emit(request)
      await waitForBatch()

      expect(diagnostics.filter((entry) => entry.flow === "swallowed-failure")).toEqual([
        {
          flow: "swallowed-failure",
          at: 1_000,
          place: { feature: "chat", place: "archive-image-write" },
          errorName: "Error",
          errorCode: "none",
        },
      ])
      expect(archiveCalls[0]).toMatchObject({ mode: "chat", images: 1, imageFiles: undefined })
    })
  })
})
