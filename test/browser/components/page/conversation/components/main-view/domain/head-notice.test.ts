import { describe, expect, it } from "vitest"

import {
  type HeadNotice,
  headNoticeOf,
  type HeadNoticeInput,
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
      "レポートを出したあと続きのターンが始まった",
      { content: REPORT, moment: "work", viewingPast: false, phase: NO_PHASE },
      { kind: "notice", text: "続きを作業中", action: "to-newest" },
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
      "過去を見ていて、最新が段取りの2段目で作業中",
      {
        content: REPORT,
        moment: "work",
        viewingPast: true,
        phase: { kind: "phase", index: 1, count: 3, name: "架空の段" },
      },
      { kind: "notice", text: "作業中 2/3", action: "to-newest" },
    ],
    [
      "過去を見ていて、最新が段取り無しで作業中",
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
