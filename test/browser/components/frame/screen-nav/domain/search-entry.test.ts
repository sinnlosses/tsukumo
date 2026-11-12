import { describe, expect, it } from "vitest"

import {
  matchingSearchEntries,
  type SearchEntry,
} from "../../../../../../src/browser/components/frame/screen-nav/domain/search-entry.ts"

function entry(key: string, group: SearchEntry["group"], label: string, hint: string): SearchEntry {
  return { key, group, label, hint, run: () => {} }
}

const ENTRIES = [
  entry("look", "見た目", "架空の見た目", ""),
  entry("command", "コマンド", "/fictional", "Fictional Command"),
  entry("screen-a", "移る", "架空の画面A", ""),
  entry("task", "タスクを頼む", "T-1 架空のタスク", "↩ で頼む"),
  entry("screen-b", "移る", "架空の画面B", ""),
] as const satisfies readonly SearchEntry[]

function keysOf(entries: readonly SearchEntry[]): readonly string[] {
  return entries.map((each) => each.key)
}

describe("matchingSearchEntries", () => {
  it("空の字ではすべてを群の順に並べ、群の中は渡した順のまま", () => {
    expect(keysOf(matchingSearchEntries(ENTRIES, "  "))).toEqual([
      "screen-a",
      "screen-b",
      "task",
      "command",
      "look",
    ])
  })

  it("空白で区切った語のどれもが名前か添える語に含まれる項目を、大文字と小文字を区別せずに残す", () => {
    expect(keysOf(matchingSearchEntries(ENTRIES, "架空 画面"))).toEqual(["screen-a", "screen-b"])
    expect(keysOf(matchingSearchEntries(ENTRIES, "command"))).toEqual(["command"])
    expect(keysOf(matchingSearchEntries(ENTRIES, "頼む T-1"))).toEqual(["task"])
    expect(keysOf(matchingSearchEntries(ENTRIES, "当たらない"))).toEqual([])
  })
})
