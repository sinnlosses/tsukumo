import { describe, expect, it } from "vitest"

import {
  createReportImageShelf,
  type ReportImage,
} from "../../../../src/server/report/core/report-image-shelf.ts"
import {
  createPromptImageShelf,
  type PromptImageShelf,
  recordedPromptImages,
  type ShelvedPromptImage,
} from "../../../../src/server/session-driver/core/prompt-image-shelf.ts"
import type { ServerFrame } from "../../../../src/shared/frame.ts"
import type { PromptImage } from "../../../../src/shared/session-driver/prompt-image.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import { MAX_SESSION_STATE_TURNS } from "../../../../src/shared/session/session-state.ts"
import { reportEvent } from "../../../fixture/report-event.ts"
import { knownRestored } from "../../../fixture/restored-event.ts"
import { createStubDriver } from "../../../fixture/session-driver.ts"
import { createSessionManager, waitForBatch } from "../../../fixture/session-manager.ts"

describe("依頼に添えた画像の棚", () => {
  // 原寸は手で組んだ大きめの架空の data URL（実物の画像は使わない）。hello に載っていれば
  // 長さで分かるように、控えより桁違いに長くしてある。
  function fullImage(label: string): PromptImage {
    return {
      full: `data:image/png;base64,${label.repeat(4096)}`,
      thumbnail: `data:image/png;base64,${label}`,
    }
  }

  /**
   * 本物の駆動と同じく、`prompt` を受けたら控えと id だけを `request` として流す駆動。
   * 受け取った画像（原寸と id つき）も覚える。
   */
  function startManagerWithShelf() {
    const shelf: PromptImageShelf = createPromptImageShelf()
    const prompted: ShelvedPromptImage[][] = []
    const manager = createSessionManager({
      promptImageShelf: shelf,
      launchSession: (onEvent) => {
        const stub = createStubDriver()
        stub.attach(onEvent)
        return Promise.resolve({
          ...stub.driver,
          prompt: (text: string, images: readonly ShelvedPromptImage[]) => {
            prompted.push([...images])
            onEvent({ kind: "request", text, images: recordedPromptImages(images) })
            onEvent({ kind: "turn-finished", outcome: { kind: "completed" } })
          },
        })
      },
    })
    const prompt = (images: readonly PromptImage[]) =>
      manager.commands.session.prompt({ text: "架空の依頼", images })
    return { manager, shelf, prompted, prompt }
  }

  function helloOf(frames: readonly ServerFrame[]): string {
    const hello = frames.find((frame) => frame.type === "hello")
    return JSON.stringify(hello)
  }

  it("hello には控えと id だけが載り、原寸の枚数に比例して大きくならない", async () => {
    const one = startManagerWithShelf()
    await one.prompt([fullImage("A")])
    const two = startManagerWithShelf()
    await two.prompt([fullImage("A"), fullImage("B")])
    await two.prompt([fullImage("C"), fullImage("D")])

    const oneFrames: ServerFrame[] = []
    one.manager.subscribe((frame) => oneFrames.push(frame))
    const twoFrames: ServerFrame[] = []
    two.manager.subscribe((frame) => twoFrames.push(frame))

    const oneHello = helloOf(oneFrames)
    const twoHello = helloOf(twoFrames)
    expect(oneHello).not.toContain(fullImage("A").full)
    expect(twoHello).not.toContain(fullImage("D").full)
    expect(twoHello).toContain(fullImage("D").thumbnail)
    // 原寸（1枚 16 KiB 強）が1枚でも載れば、この差には収まらない。
    expect(twoHello.length - oneHello.length).toBeLessThan(fullImage("A").full.length)
  })

  it("記録の窓から依頼が落ちたら、その原寸を棚から捨てる", async () => {
    const { shelf, prompted, prompt } = startManagerWithShelf()

    await prompt([fullImage("old")])
    const oldId = prompted[0]?.[0]?.id ?? ""
    expect(shelf.find(oldId)).toBeDefined()

    // 仕事の窓は MAX_SESSION_STATE_TURNS.work ターン。画像の無い依頼で押し出す。
    for (let turn = 0; turn < MAX_SESSION_STATE_TURNS.work; turn += 1) {
      await prompt([])
    }

    expect(shelf.find(oldId)).toBeUndefined()
  })

  it("起こし直して記録が空に戻ったら、それまでの原寸を棚から捨てる", async () => {
    const { manager, shelf, prompted, prompt } = startManagerWithShelf()

    await prompt([fullImage("A")])
    const id = prompted[0]?.[0]?.id ?? ""
    expect(shelf.find(id)).toBeDefined()

    await manager.commands.session.switchCharacter({ name: "fictional" })

    expect(shelf.find(id)).toBeUndefined()
  })
})

describe("レポートの画像の棚", () => {
  // 画像は架空のバイト列（実物の画像は使わない）。
  const FICTIONAL_IMAGE: ReportImage = {
    mediaType: "image/png",
    content: new Uint8Array([1, 2, 3]),
  }

  function imageReportEvent(toolUseId: string): SessionEvent {
    return reportEvent({
      toolUseId,
      sections: [
        {
          heading: "",
          blocks: [
            { kind: "image", path: "fictional/after.png", caption: "", notes: [], fold: "" },
          ],
        },
      ],
    })
  }

  function startManagerWithReportImageShelf() {
    const stub = createStubDriver()
    const shelf = createReportImageShelf()
    const readPaths: string[] = []
    const manager = createSessionManager({
      reportImageShelf: shelf,
      readReportImage: (path) => {
        readPaths.push(path)
        return FICTIONAL_IMAGE
      },
      launchSession: (onEvent, onRestoredEvents) => {
        stub.attach(onEvent)
        stub.attachRestored(onRestoredEvents)
        return Promise.resolve(stub.driver)
      },
    })
    return { manager, stub, shelf, readPaths }
  }

  it("駆動から届いた report の画像を棚に置き、復元の再生では読まない", async () => {
    const { stub, shelf, readPaths } = startManagerWithReportImageShelf()
    await waitForBatch()

    stub.emitRestored(knownRestored([imageReportEvent("toolu_restored")]))
    stub.emit(imageReportEvent("toolu_live"))
    await waitForBatch()

    expect(readPaths).toEqual(["fictional/after.png"])
    expect(shelf.find("toolu_live", "fictional/after.png")).toEqual(FICTIONAL_IMAGE)
    expect(shelf.find("toolu_restored", "fictional/after.png")).toBeUndefined()
  })

  it("起こし直して記録からレポートが消えたら、その画像を棚から捨てる", async () => {
    const { manager, stub, shelf } = startManagerWithReportImageShelf()
    await waitForBatch()
    stub.emit(imageReportEvent("toolu_live"))
    await waitForBatch()

    await manager.commands.session.switchCharacter({ name: "fictional" })

    expect(shelf.find("toolu_live", "fictional/after.png")).toBeUndefined()
  })

  function imageQuestionPending(...ids: readonly string[]): SessionEvent {
    return {
      kind: "pending-changed",
      pending: ids.map((id) => ({
        kind: "question",
        id,
        questions: [
          {
            header: "架空の選択",
            text: "架空の質問",
            multiSelect: false,
            options: [
              {
                label: "架空の案",
                description: "",
                preview: "![架空の画面](fictional/after.png)",
              },
            ],
          },
        ],
        briefs: [],
      })),
    }
  }

  it("新しく積まれた質問の preview の画像を1回だけ棚に置き、答えて記録に移っても残す", async () => {
    const { stub, shelf, readPaths } = startManagerWithReportImageShelf()
    await waitForBatch()

    stub.emit(imageQuestionPending("toolu_q1"))
    stub.emit(imageQuestionPending("toolu_q1", "toolu_q2"))
    stub.emit({
      kind: "question-answered",
      toolUseId: "toolu_q1",
      questions: [],
      answers: [],
      briefed: [],
      sentBack: 0,
    })
    stub.emit(imageQuestionPending("toolu_q2"))
    await waitForBatch()

    expect(readPaths).toEqual(["fictional/after.png", "fictional/after.png"])
    expect(shelf.find("toolu_q1", "fictional/after.png")).toEqual(FICTIONAL_IMAGE)
    expect(shelf.find("toolu_q2", "fictional/after.png")).toEqual(FICTIONAL_IMAGE)
  })

  it("答えずに答え待ちから抜けた質問の画像は棚から捨てる", async () => {
    const { stub, shelf } = startManagerWithReportImageShelf()
    await waitForBatch()

    stub.emit(imageQuestionPending("toolu_denied"))
    stub.emit({ kind: "pending-changed", pending: [] })
    await waitForBatch()

    expect(shelf.find("toolu_denied", "fictional/after.png")).toBeUndefined()
  })
})
