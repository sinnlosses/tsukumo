import { describe, expect, it } from "vitest"

import {
  type HeadNotice,
  headNoticeOf,
  type HeadNoticeInput,
  streamFloatOf,
  type StreamFloat,
  type StreamFloatInput,
} from "../../../../../../../../src/browser/components/page/conversation/components/main-view/domain/head-notice.ts"

const REPORT = {
  kind: "report",
  exchange: 1,
  arrived: true,
} as const satisfies HeadNoticeInput["content"]

const NO_PHASE = { kind: "none" } as const

describe("headNoticeOf", () => {
  it.each<[string, HeadNoticeInput, HeadNotice]>([
    [
      "最新のレポートを出したあと続きのターンが始まった",
      { content: REPORT, moment: "work", viewingPast: false, phase: NO_PHASE },
      { kind: "none" },
    ],
    [
      "レポートを出しているあいだに答え待ちが来た",
      { content: REPORT, moment: "ask", viewingPast: false, phase: NO_PHASE },
      { kind: "notice", text: "お伺いが届いた", action: "to-inquiry" },
    ],
    [
      "最新のレポートを出していて閉じている",
      { content: REPORT, moment: "deliver", viewingPast: false, phase: NO_PHASE },
      { kind: "none" },
    ],
    [
      "過去を見ていて、最新がワークプランの2段目で作業中",
      {
        content: REPORT,
        moment: "work",
        viewingPast: true,
        phase: { kind: "phase", indexes: [1], count: 3, name: "架空の段", range: { kind: "none" } },
      },
      { kind: "notice", text: "作業中 2/3", action: "to-newest" },
    ],
    [
      "過去を見ていて、最新がワークプラン無しで作業中",
      { content: REPORT, moment: "work", viewingPast: true, phase: NO_PHASE },
      { kind: "notice", text: "作業中", action: "to-newest" },
    ],
    [
      "過去を見ていて、最新が失敗で終わった",
      { content: REPORT, moment: "stumble", viewingPast: true, phase: NO_PHASE },
      { kind: "notice", text: "失敗で終わった", action: "to-newest" },
    ],
    [
      "過去を見ていて、最新が渡し終わっている",
      { content: REPORT, moment: "deliver", viewingPast: true, phase: NO_PHASE },
      { kind: "none" },
    ],
  ])("%s", (_label, input, expected) => {
    expect(headNoticeOf(input)).toEqual(expected)
  })
})

describe("streamFloatOf", () => {
  const WORKING_NOTICE = {
    kind: "notice",
    text: "作業中",
    action: "to-newest",
  } as const satisfies HeadNotice
  const ASK_NOTICE = {
    kind: "notice",
    text: "お伺いが届いた",
    action: "to-inquiry",
  } as const satisfies HeadNotice

  it.each<[string, StreamFloatInput, StreamFloat]>([
    [
      "最新を見ていて、お伺いのカードが見える範囲の外にある",
      { notice: { kind: "none" }, viewingPast: false, inquiryOutOfSight: true },
      { kind: "inquiry" },
    ],
    [
      "最新を見ていて、お伺いのカードが見えている",
      { notice: { kind: "none" }, viewingPast: false, inquiryOutOfSight: false },
      { kind: "none" },
    ],
    [
      "最新を見ていて、同じ行き先の知らせもある（お伺い ↓ だけを出す）",
      { notice: ASK_NOTICE, viewingPast: false, inquiryOutOfSight: true },
      { kind: "inquiry" },
    ],
    [
      "過去を見ていて、知らせとお伺いの両方がある（知らせだけを出す）",
      { notice: WORKING_NOTICE, viewingPast: true, inquiryOutOfSight: true },
      WORKING_NOTICE,
    ],
    [
      "過去を見ていて、知らせが無ければお伺いが外にあっても出さない",
      { notice: { kind: "none" }, viewingPast: true, inquiryOutOfSight: true },
      { kind: "none" },
    ],
  ])("%s", (_label, input, expected) => {
    expect(streamFloatOf(input)).toEqual(expected)
  })
})
