import { describe, expect, it } from "bun:test"

import {
  chatLogByteSize,
  chatLogEntries,
  chatLogRows,
  type ChatLogEntry,
} from "../../src/shared/chat-log.ts"
import { type RecordTime, type SessionRecord } from "../../src/shared/session-state.ts"

// 雑談のログは**素直な時系列**（docs/design.md 13.7）。`mainViewEntries` のように依頼で
// まとめ直さないことを、並びと落とすものの2点で固定する。
//
// 文面は手で書いた架空のもの（docs/coding-standards.md「会話内容の扱い」）。

/** 時刻に依らないテストの記録に添える時刻。 */
const STAMPED = { kind: "stamped", at: 0 } satisfies RecordTime

const RECORDS: readonly SessionRecord[] = [
  { kind: "request", turnId: 0, text: "1つめの依頼", images: [], time: STAMPED },
  { kind: "speech", text: "1つめのセリフ", expression: "default", time: STAMPED },
  { kind: "request", turnId: 1, text: "2つめの依頼", images: [], time: STAMPED },
  { kind: "speech", text: "2つめのセリフ", expression: "proud", time: STAMPED },
]

describe("chatLogEntries", () => {
  it("利用者の発言とセリフが、記録の順（古い→新しい）のまま交互に積む", () => {
    expect(chatLogEntries(RECORDS)).toEqual([
      { speaker: "user", text: "1つめの依頼", images: [], time: STAMPED },
      { speaker: "character", text: "1つめのセリフ", expression: "default", time: STAMPED },
      { speaker: "user", text: "2つめの依頼", images: [], time: STAMPED },
      { speaker: "character", text: "2つめのセリフ", expression: "proud", time: STAMPED },
    ])
  })

  it("本文・ツール・質問は落とす（雑談中はレポートを出さない）", () => {
    const entries = chatLogEntries([
      { kind: "request", turnId: 2, text: "架空の依頼", images: [], time: STAMPED },
      { kind: "detail", markdown: "## 架空のレポート" },
      {
        kind: "tool",
        toolUseId: "t-1",
        name: "Read",
        input: {},
        nested: false,
        status: { kind: "running" },
      },
      { kind: "question", questions: [], answers: [] },
      { kind: "speech", text: "架空のセリフ", expression: "default", time: STAMPED },
    ])

    expect(entries.map((entry) => entry.speaker)).toEqual(["user", "character"])
  })

  it("表情はキャラクターの側にだけ付く（話者の印に使う）", () => {
    const entries = chatLogEntries(RECORDS)

    expect(entries[0]).not.toHaveProperty("expression")
    expect(entries[1]).toHaveProperty("expression", "default")
  })

  it("記録が空なら空（まだ何も話していない場面）", () => {
    expect(chatLogEntries([])).toEqual([])
  })

  it("圧縮の区切り（compact-boundary）は1件のイベントから1件のログの区切りになる", () => {
    const entries = chatLogEntries([
      { kind: "request", turnId: 3, text: "1つめの依頼", images: [], time: STAMPED },
      { kind: "compact-boundary" },
      { kind: "speech", text: "2つめのセリフ", expression: "default", time: STAMPED },
    ])

    expect(entries).toEqual([
      { speaker: "user", text: "1つめの依頼", images: [], time: STAMPED },
      { speaker: "boundary" },
      { speaker: "character", text: "2つめのセリフ", expression: "default", time: STAMPED },
    ])
  })
})

describe("chatLogByteSize", () => {
  it("空なら0", () => {
    expect(chatLogByteSize([])).toBe(0)
  })

  it("利用者だけの文面を UTF-8 バイト数で数える", () => {
    // "あ" は UTF-8 で3バイト。
    const entries = chatLogEntries([
      { kind: "request", turnId: 4, text: "あああ", images: [], time: STAMPED },
    ])

    expect(chatLogByteSize(entries)).toBe(9)
  })

  it("セリフだけの文面も数える", () => {
    const entries = chatLogEntries([
      { kind: "speech", text: "架空のセリフ", expression: "default", time: STAMPED },
    ])

    expect(chatLogByteSize(entries)).toBe(new TextEncoder().encode("架空のセリフ").length)
  })

  it("画像つきの依頼でも、添えた画像は数えない", () => {
    const withImages = chatLogEntries([
      {
        kind: "request",
        turnId: 0,
        text: "あああ",
        images: ["data:image/png;base64,architecture-tallying-decoy"],
        time: STAMPED,
      },
    ])
    const withoutImages = chatLogEntries([
      { kind: "request", turnId: 5, text: "あああ", images: [], time: STAMPED },
    ])

    expect(chatLogByteSize(withImages)).toBe(chatLogByteSize(withoutImages))
  })

  it("圧縮の区切りは文面を持たないので数えない", () => {
    const withBoundary = chatLogEntries([
      { kind: "request", turnId: 6, text: "あああ", images: [], time: STAMPED },
      { kind: "compact-boundary" },
    ])
    const withoutBoundary = chatLogEntries([
      { kind: "request", turnId: 7, text: "あああ", images: [], time: STAMPED },
    ])

    expect(chatLogByteSize(withBoundary)).toBe(chatLogByteSize(withoutBoundary))
  })

  it("複数件は合算する", () => {
    const entries = chatLogEntries([
      { kind: "request", turnId: 8, text: "1つめの依頼", images: [], time: STAMPED },
      { kind: "speech", text: "1つめのセリフ", expression: "default", time: STAMPED },
    ])

    expect(chatLogByteSize(entries)).toBe(
      new TextEncoder().encode("1つめの依頼").length +
        new TextEncoder().encode("1つめのセリフ").length,
    )
  })
})

describe("chatLogRows", () => {
  // 日の境目は東京の時刻で決める（テストを走らせるマシンのタイムゾーンに依らない）。
  const TIME_ZONE = "Asia/Tokyo"

  /** 東京の日時から、時刻の分かる発言を作る（文面は架空）。 */
  function userAt(isoLocal: string): ChatLogEntry {
    return {
      speaker: "user",
      text: `架空の発言（${isoLocal}）`,
      images: [],
      time: {
        kind: "stamped",
        at: Temporal.ZonedDateTime.from(`${isoLocal}+09:00[${TIME_ZONE}]`).epochMilliseconds,
      },
    }
  }

  function characterAt(isoLocal: string): ChatLogEntry {
    return {
      speaker: "character",
      text: `架空のセリフ（${isoLocal}）`,
      expression: "default",
      time: {
        kind: "stamped",
        at: Temporal.ZonedDateTime.from(`${isoLocal}+09:00[${TIME_ZONE}]`).epochMilliseconds,
      },
    }
  }

  const RESTORED_USER: ChatLogEntry = {
    speaker: "user",
    text: "組み直した架空の発言",
    images: [],
    time: { kind: "restored" },
  }

  /** 行の並びを、区切りは日付、発言は番号の短い形にする（比べやすいように）。 */
  function shape(entries: readonly ChatLogEntry[]): readonly string[] {
    return chatLogRows(entries, TIME_ZONE).map((row) =>
      row.kind === "day" ? `day:${row.date.toString()}` : `entry:${String(row.index)}`,
    )
  }

  it("日が変わらなければ区切りは入らない（先頭にも入れない）", () => {
    expect(
      shape([
        userAt("2026-09-22T00:00:00"),
        characterAt("2026-09-22T12:00:00"),
        userAt("2026-09-22T23:59:59"),
      ]),
    ).toEqual(["entry:0", "entry:1", "entry:2"])
  })

  it("日をまたぐと、日が変わった発言の手前に区切りが1本だけ入る", () => {
    expect(
      shape([
        userAt("2026-09-22T23:58:00"),
        characterAt("2026-09-22T23:59:59"),
        userAt("2026-09-23T00:00:00"),
        characterAt("2026-09-23T00:01:00"),
      ]),
    ).toEqual(["entry:0", "entry:1", "day:2026-09-23", "entry:2", "entry:3"])
  })

  it("日の境目は渡したタイムゾーンで決まる（UTC では同じ日でも、東京で日が変われば区切る）", () => {
    // 東京の 08:59 と 09:00 は UTC では前日の 23:59 と当日の 00:00。東京では同じ日。
    expect(shape([userAt("2026-09-23T08:59:00"), userAt("2026-09-23T09:00:00")])).toEqual([
      "entry:0",
      "entry:1",
    ])
  })

  it("圧縮の区切りは日の比べに数えない（前後の発言の日で決める）", () => {
    expect(
      shape([
        userAt("2026-09-22T22:00:00"),
        { speaker: "boundary" },
        userAt("2026-09-23T07:00:00"),
      ]),
    ).toEqual(["entry:0", "entry:1", "day:2026-09-23", "entry:2"])
    expect(
      shape([
        userAt("2026-09-23T06:00:00"),
        { speaker: "boundary" },
        userAt("2026-09-23T07:00:00"),
      ]),
    ).toEqual(["entry:0", "entry:1", "entry:2"])
  })

  it("時刻の分からない発言（組み直したもの）の間には区切りを入れず、いまの発言へ移るところで区切る", () => {
    expect(
      shape([
        RESTORED_USER,
        RESTORED_USER,
        userAt("2026-09-23T10:00:00"),
        characterAt("2026-09-23T10:01:00"),
      ]),
    ).toEqual(["entry:0", "entry:1", "day:2026-09-23", "entry:2", "entry:3"])
  })

  it("発言の行は chatLogEntries の並びでの番号を持つ（区切りが入っても番号はずれない）", () => {
    const nextDay = characterAt("2026-09-23T10:00:00")
    const rows = chatLogRows([userAt("2026-09-22T10:00:00"), nextDay], TIME_ZONE)

    expect(rows[2]).toEqual({ kind: "entry", index: 1, entry: nextDay })
  })
})
