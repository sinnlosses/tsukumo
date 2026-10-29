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
import type { RestoredEvent, SessionEvent } from "../../../../src/shared/session/session-event.ts"
import { MAX_SESSION_STATE_TURNS } from "../../../../src/shared/session/session-record.ts"
import { reportOfDrawn } from "../../../fixture/report-event.ts"
import { knownRestored } from "../../../fixture/restored-event.ts"
import { createStubDriver } from "../../../fixture/session-driver.ts"
import { requestEvent } from "../../../fixture/session-event.ts"
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
            onEvent(requestEvent(text, recordedPromptImages(images)))
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

  /** 続きから起こした駆動へ、transcript から組み直した再生を流せる形で起こす。 */
  function startRestoringManager() {
    const shelf: PromptImageShelf = createPromptImageShelf()
    // 棚に置き直した id を覚える（窓から溢れて捨てられたものも、ここに残る）。
    const placedIds: string[] = []
    const stub = createStubDriver()
    const manager = createSessionManager({
      promptImageShelf: {
        ...shelf,
        shelveRestored: (fulls) => {
          const recorded = shelf.shelveRestored(fulls)
          placedIds.push(...recorded.map((image) => image.id))
          return recorded
        },
      },
      launchSession: (onEvent, onRestoredEvents) => {
        stub.attach(onEvent)
        stub.attachRestored(onRestoredEvents)
        return Promise.resolve(stub.driver)
      },
    })
    const restoredRequest = (promptImages: readonly string[]): RestoredEvent => ({
      event: requestEvent("架空の依頼"),
      time: { kind: "known", at: 1 },
      promptImages,
    })
    return { manager, shelf, stub, placedIds, restoredRequest }
  }

  it("復元した依頼の原寸を棚に置き、記録には控えの無い id だけを載せる", async () => {
    const { manager, shelf, stub, restoredRequest } = startRestoringManager()
    await waitForBatch()
    const frames: ServerFrame[] = []
    manager.subscribe((frame) => frames.push(frame))

    stub.emitRestored([restoredRequest([fullImage("A").full, fullImage("B").full])])
    await waitForBatch()

    const request = manager.commandSession
      .state()
      .records.find((record) => record.kind === "request")
    const images = request?.kind === "request" ? request.images : []
    expect(images.map((image) => image.kind)).toEqual(["restored", "restored"])
    expect(images.map((image) => shelf.find(image.id))).toEqual([
      fullImage("A").full,
      fullImage("B").full,
    ])
    const lastHello = JSON.stringify(frames.filter((frame) => frame.type === "hello").at(-1))
    expect(lastHello).toContain(images[0]?.id ?? "画像が載っていない")
    expect(lastHello).not.toContain(fullImage("A").full)
  })

  it("復元した依頼のうち記録の窓から溢れたものの原寸は、棚に残さない", async () => {
    const { manager, shelf, stub, placedIds, restoredRequest } = startRestoringManager()
    await waitForBatch()

    stub.emitRestored([
      restoredRequest([fullImage("old").full]),
      ...Array.from({ length: MAX_SESSION_STATE_TURNS.work }, () => restoredRequest([])),
      restoredRequest([fullImage("new").full]),
    ])
    await waitForBatch()

    const kept = manager.commandSession
      .state()
      .records.flatMap((record) => (record.kind === "request" ? record.images : []))
    expect(placedIds).toHaveLength(2)
    expect(kept.map((image) => image.id)).toEqual(placedIds.slice(1))
    expect(placedIds.map((id) => shelf.find(id))).toEqual([undefined, fullImage("new").full])
  })
})

describe("レポートの画像の棚", () => {
  // 画像は架空のバイト列（実物の画像は使わない）。
  const FICTIONAL_IMAGE: ReportImage = {
    mediaType: "image/png",
    content: new Uint8Array([1, 2, 3]),
  }

  // PNG の印と、320x180 を書いた IHDR の頭だけの架空のバイト列。
  const SIZED_IMAGE: ReportImage = {
    mediaType: "image/png",
    content: new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0,
      0x01, 0x40, 0, 0, 0, 0xb4,
    ]),
  }

  function imageReportEvent(toolUseId: string): SessionEvent {
    return reportOfDrawn({
      toolUseId,
      sections: [
        {
          heading: "",
          blocks: [
            {
              kind: "image",
              path: "fictional/after.png",
              caption: "",
              notes: [],
              fold: "",
              aside: "",
            },
          ],
        },
      ],
    })
  }

  const NOW = 100 * 60 * 60 * 1000
  const DAY = 24 * 60 * 60 * 1000

  /** `modifiedAt` は読む先のファイルの更新時刻（ミリ秒）。上限より新しければ読めない扱いにする。 */
  function startManagerWithReportImageShelf(modifiedAt = 0, image = FICTIONAL_IMAGE) {
    const stub = createStubDriver()
    const shelf = createReportImageShelf()
    const readPaths: string[] = []
    const manager = createSessionManager({
      now: () => NOW,
      reportImageShelf: shelf,
      readReportImage: (path, notModifiedAfter) => {
        readPaths.push(path)
        return modifiedAt > notModifiedAfter ? undefined : image
      },
      launchSession: (onEvent, onRestoredEvents) => {
        stub.attach(onEvent)
        stub.attachRestored(onRestoredEvents)
        return Promise.resolve(stub.driver)
      },
    })
    return { manager, stub, shelf, readPaths }
  }

  it("駆動から届いた report の画像を棚に置く", async () => {
    const { stub, shelf, readPaths } = startManagerWithReportImageShelf()
    await waitForBatch()

    stub.emit(imageReportEvent("toolu_live"))
    await waitForBatch()

    expect(readPaths).toEqual(["fictional/after.png"])
    expect(shelf.find("toolu_live", "fictional/after.png")).toEqual(FICTIONAL_IMAGE)
  })

  it("復元した report のうち、棚に残るのは記録の窓に残る24時間以内のものだけ（古いもの・時刻が分からないものは読みにも行かない）", async () => {
    const { stub, shelf, readPaths } = startManagerWithReportImageShelf()
    await waitForBatch()
    const recent = NOW - DAY
    const turn = (text: string): RestoredEvent => ({
      event: requestEvent(text),
      time: { kind: "known", at: recent },
      promptImages: [],
    })
    const report = (id: string, time: RestoredEvent["time"]): RestoredEvent => ({
      event: imageReportEvent(id),
      time,
      promptImages: [],
    })

    stub.emitRestored([
      turn("架空の依頼"),
      report("toolu_dropped", { kind: "known", at: recent }),
      ...Array.from({ length: MAX_SESSION_STATE_TURNS.work - 2 }, () => turn("架空の依頼")),
      turn("架空の依頼"),
      report("toolu_old", { kind: "known", at: NOW - DAY - 1 }),
      turn("架空の依頼"),
      report("toolu_unknown", { kind: "unknown" }),
      turn("架空の依頼"),
      report("toolu_kept", { kind: "known", at: recent }),
    ])
    await waitForBatch()

    const placed = ["toolu_dropped", "toolu_old", "toolu_unknown", "toolu_kept"].filter(
      (id) => shelf.find(id, "fictional/after.png") !== undefined,
    )
    expect(placed).toEqual(["toolu_kept"])
    expect(readPaths).toHaveLength(1)
  })

  it("復元した report より後に更新されたファイルの画像は棚に置かない", async () => {
    const { stub, shelf } = startManagerWithReportImageShelf(NOW - 1)
    await waitForBatch()

    stub.emitRestored(knownRestored([imageReportEvent("toolu_rewritten")], NOW - 2))
    await waitForBatch()

    expect(shelf.find("toolu_rewritten", "fictional/after.png")).toBeUndefined()
  })

  it("棚に置けなかった・寸法を測れなかった画像のパスを、配る report と記録に載せる", async () => {
    const { manager, stub } = startManagerWithReportImageShelf()
    await waitForBatch()
    const frames: ServerFrame[] = []
    manager.subscribe((frame) => frames.push(frame))

    stub.emit(imageReportEvent("toolu_unmeasured"))
    await waitForBatch()

    const delivered = frames.flatMap((frame) =>
      frame.type === "events" ? frame.events.map(({ event }) => event) : [],
    )
    expect(delivered).toContainEqual(
      expect.objectContaining({
        kind: "report",
        imageSizes: [],
        unshelvedImages: ["fictional/after.png"],
      }),
    )
    expect(manager.commandSession.state().records.at(-1)).toMatchObject({
      kind: "report",
      unshelvedImages: ["fictional/after.png"],
    })
  })

  it("復元した report の、読み直せなかった画像のパスも記録に載せる", async () => {
    const { manager, stub } = startManagerWithReportImageShelf(NOW - 1)
    await waitForBatch()

    stub.emitRestored(knownRestored([imageReportEvent("toolu_rewritten")], NOW - 2))
    await waitForBatch()

    expect(manager.commandSession.state().records.at(-1)).toMatchObject({
      kind: "report",
      unshelvedImages: ["fictional/after.png"],
    })
  })

  it("report の figure に置いた画像も棚に置く", async () => {
    const { stub, shelf } = startManagerWithReportImageShelf()
    await waitForBatch()

    stub.emit(
      reportOfDrawn({
        toolUseId: "toolu_figure",
        figure: {
          kind: "image",
          path: "fictional/figure.png",
          caption: "",
          notes: [],
          fold: "",
          aside: "",
        },
      }),
    )
    await waitForBatch()

    expect(shelf.find("toolu_figure", "fictional/figure.png")).toEqual(FICTIONAL_IMAGE)
  })

  it("棚に置いたときに測れた寸法を、配る report と記録に載せる", async () => {
    const { manager, stub } = startManagerWithReportImageShelf(0, SIZED_IMAGE)
    await waitForBatch()
    const frames: ServerFrame[] = []
    manager.subscribe((frame) => frames.push(frame))

    stub.emit(imageReportEvent("toolu_live"))
    await waitForBatch()

    const sizes = [{ path: "fictional/after.png", width: 320, height: 180 }]
    const delivered = frames.flatMap((frame) =>
      frame.type === "events" ? frame.events.map(({ event }) => event) : [],
    )
    expect(delivered).toContainEqual(expect.objectContaining({ kind: "report", imageSizes: sizes }))
    expect(manager.commandSession.state().records.at(-1)).toMatchObject({
      kind: "report",
      imageSizes: sizes,
    })
  })

  it("復元した report の記録にも、棚に置き直したときに測れた寸法を載せる", async () => {
    const { manager, stub } = startManagerWithReportImageShelf(0, SIZED_IMAGE)
    await waitForBatch()

    stub.emitRestored(knownRestored([requestEvent(), imageReportEvent("toolu_restored")], NOW - 1))
    await waitForBatch()

    expect(manager.commandSession.state().records.at(-1)).toMatchObject({
      kind: "report",
      imageSizes: [{ path: "fictional/after.png", width: 320, height: 180 }],
    })
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
        imageSizes: [],
        unshelvedImages: [],
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
    })
    stub.emit(imageQuestionPending("toolu_q2"))
    await waitForBatch()

    expect(readPaths).toEqual(["fictional/after.png", "fictional/after.png"])
    expect(shelf.find("toolu_q1", "fictional/after.png")).toEqual(FICTIONAL_IMAGE)
    expect(shelf.find("toolu_q2", "fictional/after.png")).toEqual(FICTIONAL_IMAGE)
  })

  it("質問の画像に棚に置いたときに測れた寸法を載せ、積み直しても引き継ぐ", async () => {
    const { manager, stub } = startManagerWithReportImageShelf(0, SIZED_IMAGE)
    await waitForBatch()

    stub.emit(imageQuestionPending("toolu_q1"))
    await waitForBatch()
    stub.emit(imageQuestionPending("toolu_q1", "toolu_q2"))
    await waitForBatch()

    const sizes = [{ path: "fictional/after.png", width: 320, height: 180 }]
    expect(manager.commandSession.state().pending).toMatchObject([
      { id: "toolu_q1", imageSizes: sizes, unshelvedImages: [] },
      { id: "toolu_q2", imageSizes: sizes, unshelvedImages: [] },
    ])
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
