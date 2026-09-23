// `scripts/progress-done-section.ts` の割る・畳む純粋関数を、実ファイルに近い形の
// `develop/progress.md` フィクスチャで検証する。git は一切起こさない（それは
// `test/scripts/merge-progress.test.ts` / `merge-progress-git.test.ts` の役目）。

import { describe, expect, test } from "bun:test"

import {
  buildSectionConflictText,
  type DoneSection,
  joinDoneSections,
  mergeDoneSections,
  splitDoneSection,
} from "../../scripts/progress-done-section.ts"
import {
  sampleProgressDoc,
  withEditedBody,
  withoutSection,
  withPrependedSection,
} from "../fixture/progress-doc.ts"

describe("splitDoneSection", () => {
  test("前文・小節・節の外（未解決/注意）に割る", () => {
    const split = splitDoneSection(sampleProgressDoc())
    expect(split).toBeDefined()
    expect(split?.head).toContain("# 現在の状態")
    expect(split?.head).toContain("## 完了したこと（このセッション）")
    expect(split?.head).not.toContain("### ")
    expect(split?.sections.map((section) => section.heading)).toEqual([
      "### 2026-09-20 古い1（T-100）",
      "### 2026-09-19 古い2（T-099）",
    ])
    expect(split?.sections[0]?.date).toBe("2026-09-20")
    expect(split?.tail).toContain("## 未解決")
    expect(split?.tail).toContain("## 注意")
  })

  test("「## 完了したこと」が無ければ undefined", () => {
    expect(splitDoneSection("# 現在の状態\n\n本文だけ。\n")).toBeUndefined()
  })

  test("小節を戻すと元の「## 完了したこと」配下と一致する", () => {
    const split = splitDoneSection(sampleProgressDoc())
    expect(split).toBeDefined()
    expect(joinDoneSections(split?.sections ?? [])).toBe(
      "### 2026-09-20 古い1（T-100）\n\n本文1。\n\n### 2026-09-19 古い2（T-099）\n\n本文2。\n\n",
    )
  })
})

describe("mergeDoneSections", () => {
  test("両側が足した小節はどちらも残り、日付の降順に並ぶ", () => {
    const base = sectionsOf(sampleProgressDoc())
    const ours = sectionsOf(
      withPrependedSection(sampleProgressDoc(), "2026-09-23", "ours追加（T-401）"),
    )
    const theirs = sectionsOf(
      withPrependedSection(sampleProgressDoc(), "2026-09-22", "theirs追加（T-402）"),
    )

    const result = mergeDoneSections(base, ours, theirs)

    expect(result.conflicts).toEqual([])
    expect(result.sections.map((section) => section.heading)).toEqual([
      "### 2026-09-23 ours追加（T-401）",
      "### 2026-09-22 theirs追加（T-402）",
      "### 2026-09-20 古い1（T-100）",
      "### 2026-09-19 古い2（T-099）",
    ])
  })

  test("片方が消した小節（アーカイブ）は消えたままになる", () => {
    const base = sectionsOf(sampleProgressDoc())
    const ours = sectionsOf(withoutSection(sampleProgressDoc(), "### 2026-09-19 古い2（T-099）"))
    const theirs = sectionsOf(sampleProgressDoc())

    const result = mergeDoneSections(base, ours, theirs)

    expect(result.conflicts).toEqual([])
    expect(result.sections.map((section) => section.heading)).toEqual([
      "### 2026-09-20 古い1（T-100）",
    ])
  })

  test("片方だけが触った小節は、その書き換えを残す", () => {
    const base = sectionsOf(sampleProgressDoc())
    const ours = sectionsOf(
      withEditedBody(sampleProgressDoc(), "本文1。", "本文1（ours が書き換えた）。"),
    )
    const theirs = sectionsOf(sampleProgressDoc())

    const result = mergeDoneSections(base, ours, theirs)

    expect(result.conflicts).toEqual([])
    const edited = result.sections.find((s) => s.heading === "### 2026-09-20 古い1（T-100）")
    expect(edited?.text).toContain("本文1（ours が書き換えた）。")
  })

  test("同じ小節を両側が別々に書き換えたときは衝突として返す", () => {
    const base = sectionsOf(sampleProgressDoc())
    const ours = sectionsOf(withEditedBody(sampleProgressDoc(), "本文1。", "ours版。"))
    const theirs = sectionsOf(withEditedBody(sampleProgressDoc(), "本文1。", "theirs版。"))

    const result = mergeDoneSections(base, ours, theirs)

    expect(result.sections.map((section) => section.heading)).not.toContain(
      "### 2026-09-20 古い1（T-100）",
    )
    expect(result.conflicts).toHaveLength(1)
    expect(result.conflicts[0]?.heading).toBe("### 2026-09-20 古い1（T-100）")
    expect(result.conflicts[0]?.ours.text).toContain("ours版。")
    expect(result.conflicts[0]?.theirs.text).toContain("theirs版。")
  })

  test("両側とも同じ内容へ書き換えていれば衝突にしない", () => {
    const base = sectionsOf(sampleProgressDoc())
    const ours = sectionsOf(withEditedBody(sampleProgressDoc(), "本文1。", "同じ書き換え。"))
    const theirs = sectionsOf(withEditedBody(sampleProgressDoc(), "本文1。", "同じ書き換え。"))

    const result = mergeDoneSections(base, ours, theirs)

    expect(result.conflicts).toEqual([])
    expect(result.sections.map((s) => s.heading)).toContain("### 2026-09-20 古い1（T-100）")
  })

  test("base に無い小節を両側が同じ見出し・同じ内容で足したときは1つにまとめる", () => {
    const base: readonly DoneSection[] = []
    const added = sectionsOf(
      withPrependedSection(sampleProgressDoc(), "2026-09-23", "同時追加（T-403）"),
    )
    const onlyAdded = added.filter((s) => s.heading === "### 2026-09-23 同時追加（T-403）")

    const result = mergeDoneSections(base, onlyAdded, onlyAdded)

    expect(result.conflicts).toEqual([])
    expect(result.sections).toHaveLength(1)
  })
})

describe("buildSectionConflictText", () => {
  test("ours と theirs を衝突マーカーで挟む", () => {
    const ours: DoneSection = { heading: "### h", date: undefined, text: "ours本文\n\n" }
    const theirs: DoneSection = { heading: "### h", date: undefined, text: "theirs本文\n\n" }
    const text = buildSectionConflictText({ heading: "### h", ours, theirs })
    expect(text).toBe("<<<<<<< ours\nours本文\n\n=======\ntheirs本文\n\n>>>>>>> theirs\n")
  })
})

function sectionsOf(doc: string): readonly DoneSection[] {
  const split = splitDoneSection(doc)
  if (split === undefined) {
    throw new Error("テストフィクスチャに「## 完了したこと」が無い")
  }
  return split.sections
}
