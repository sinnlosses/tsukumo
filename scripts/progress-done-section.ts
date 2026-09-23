// `develop/progress.md` の「## 完了したこと（このセッション）」節を、`### ` 見出しの小節に
// 割る・3wayで畳む純粋関数。`scripts/merge-progress.ts`（git のマージドライバ）が使う。
//
// 節の割り方は `~/.claude/skills/task-workflow/scripts/taskfiles.py` の `split_done_section` と
// 同じ規約（`## 完了したこと` で前方一致、次の `## ` 見出しまでが対象、`### ` 行が小節の境目）
// に合わせてある。ずれると共通スキルの `status.py` / `archive.py` の判定と食い違う。

/** 「## 完了したこと」配下の `### ` 小節1つ。 */
export type DoneSection = {
  /** 見出し行そのもの（改行を除く）。小節の同一性を見分ける鍵として使う。 */
  readonly heading: string
  /** 見出しが `### YYYY-MM-DD ...` の形のときだけ取れる日付。 */
  readonly date: string | undefined
  /** 見出し行から次の小節の直前までの全文（改行込み）。 */
  readonly text: string
}

/** ファイルを「## 完了したこと」の前後と、配下の小節に割った形。 */
export type DoneSectionSplit = {
  /** ファイル先頭から「## 完了したこと」見出し・最初の小節の直前までの前文。 */
  readonly head: string
  /** 「## 完了したこと」配下の `### ` 小節（見出しに書かれた順のまま）。 */
  readonly sections: readonly DoneSection[]
  /** 「## 完了したこと」の次に来る `## ` 見出し以降（`## 未解決` など）。 */
  readonly tail: string
}

/** 同じ見出しを両側が別々の内容へ書き換えた、解けない衝突。 */
export type SectionConflict = {
  readonly heading: string
  readonly ours: DoneSection
  readonly theirs: DoneSection
}

/** 両側にある同じ見出しの小節を突き合わせた結果。 */
type BothSidesResolution =
  | { readonly kind: "resolved"; readonly section: DoneSection }
  | { readonly kind: "conflict"; readonly conflict: SectionConflict }

/** 小節どうしの3wayマージの結果。 */
export type SectionMergeResult = {
  /** 衝突なく決まった小節。日付の降順に並べ直してある。 */
  readonly sections: readonly DoneSection[]
  /** 両側が別々に書き換えて機械では決められなかった小節。 */
  readonly conflicts: readonly SectionConflict[]
}

const DONE_HEADING_PREFIX = "## 完了したこと"
const TOP_HEADING_PREFIX = "## "
const SECTION_HEADING_PREFIX = "### "
const DATE_HEADING = /^### (\d{4}-\d{2}-\d{2})\b/

/**
 * ファイルを「## 完了したこと」の前後と配下の小節に割る。**その見出しが無ければ `undefined`**
 * （呼び出し側はこれを「畳む前提が崩れている」合図にして、ファイル全体を素の3wayに任せる）。
 */
export function splitDoneSection(text: string): DoneSectionSplit | undefined {
  const lines = splitKeepingLineEndings(text)
  const start = lines.findIndex((line) => line.startsWith(DONE_HEADING_PREFIX))
  if (start === -1) {
    return undefined
  }

  let end = lines.length
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i]?.startsWith(TOP_HEADING_PREFIX) === true) {
      end = i
      break
    }
  }

  const bodies: string[][] = []
  let headEnd = end
  for (let i = start + 1; i < end; i += 1) {
    const line = lines[i]
    if (line === undefined) {
      continue
    }
    if (line.startsWith(SECTION_HEADING_PREFIX)) {
      headEnd = Math.min(headEnd, i)
      bodies.push([line])
      continue
    }
    const lastBody = bodies.at(-1)
    if (lastBody !== undefined) {
      lastBody.push(line)
    }
  }

  return {
    head: lines.slice(0, headEnd).join(""),
    sections: bodies.map(toDoneSection),
    tail: lines.slice(end).join(""),
  }
}

/** 割った小節を、見出しに書かれていた順のまま1つのテキストへ戻す。 */
export function joinDoneSections(sections: readonly DoneSection[]): string {
  return sections.map((section) => section.text).join("")
}

/**
 * 両側の衝突1件を、人が手で解く前提の衝突マーカー付きテキストにする。
 * `git merge-file` 自体の書式（`<<<<<<<` / `=======` / `>>>>>>>`）に合わせてある。
 */
export function buildSectionConflictText(conflict: SectionConflict): string {
  return `<<<<<<< ours\n${conflict.ours.text}=======\n${conflict.theirs.text}>>>>>>> theirs\n`
}

/**
 * 小節の配列を3wayで畳む。
 *
 * - base に無く、どちらか一方だけが足した小節はそのまま残す（両側が足した）
 * - base にあって、片方の配列から消えている小節は**消えたまま**にする（アーカイブの巻き戻り
 *   を避ける。`merge=union` を採らなかった理由と同じ）
 * - base にあって、片方だけが書き換えた小節はその書き換えを残す
 * - 両側にあって内容が食い違い、どちらも base と一致しない（＝両側が別々に書き換えた）ときは
 *   `conflicts` に積む。**黙ってどちらかを捨てない**
 * - 残った小節は日付の降順（新しい順）へ並べ直す。同じ日付どうしの順は問わない
 */
export function mergeDoneSections(
  base: readonly DoneSection[],
  ours: readonly DoneSection[],
  theirs: readonly DoneSection[],
): SectionMergeResult {
  const baseByHeading = new Map(base.map((section) => [section.heading, section]))
  const oursByHeading = new Map(ours.map((section) => [section.heading, section]))
  const theirsByHeading = new Map(theirs.map((section) => [section.heading, section]))
  const headings = new Set([...oursByHeading.keys(), ...theirsByHeading.keys()])

  const resolved: DoneSection[] = []
  const conflicts: SectionConflict[] = []

  for (const heading of headings) {
    const baseSection = baseByHeading.get(heading)
    const oursSection = oursByHeading.get(heading)
    const theirsSection = theirsByHeading.get(heading)

    if (oursSection !== undefined && theirsSection !== undefined) {
      const resolution = resolveBothSides(baseSection, oursSection, theirsSection)
      if (resolution.kind === "resolved") {
        resolved.push(resolution.section)
      } else {
        conflicts.push(resolution.conflict)
      }
      continue
    }
    // base にあって片方の配列にだけ無いのは、その側が消した（アーカイブ）。消えたままにする。
    // base に無く片方の配列にだけあるのは、その側だけが足した。そのまま残す。
    if (oursSection !== undefined && baseSection === undefined) {
      resolved.push(oursSection)
    } else if (theirsSection !== undefined && baseSection === undefined) {
      resolved.push(theirsSection)
    }
  }

  return { sections: orderByDateDescending(resolved), conflicts }
}

/** 両側にある同じ見出しの小節を1つに決める。決められなければ衝突として返す。 */
function resolveBothSides(
  baseSection: DoneSection | undefined,
  oursSection: DoneSection,
  theirsSection: DoneSection,
): BothSidesResolution {
  if (oursSection.text === theirsSection.text) {
    return { kind: "resolved", section: oursSection }
  }
  if (baseSection !== undefined && baseSection.text === oursSection.text) {
    return { kind: "resolved", section: theirsSection } // theirs だけが書き換えた
  }
  if (baseSection !== undefined && baseSection.text === theirsSection.text) {
    return { kind: "resolved", section: oursSection } // ours だけが書き換えた
  }
  return {
    kind: "conflict",
    conflict: { heading: oursSection.heading, ours: oursSection, theirs: theirsSection },
  }
}

/** 日付の降順（新しい順）へ並べ直す。日付が取れない小節は末尾へ送る。 */
function orderByDateDescending(sections: readonly DoneSection[]): readonly DoneSection[] {
  return sections.toSorted((a, b) => {
    const aDate = a.date ?? ""
    const bDate = b.date ?? ""
    if (aDate === bDate) {
      return 0
    }
    return aDate > bDate ? -1 : 1
  })
}

function toDoneSection(bodyLines: readonly string[]): DoneSection {
  const text = bodyLines.join("")
  const headingLine = bodyLines[0] ?? ""
  const match = DATE_HEADING.exec(headingLine)
  return { heading: headingLine.trimEnd(), date: match?.[1], text }
}

/** `String.prototype.split` と違い、各行に元の改行文字を残す（`str.splitlines(keepends=True)` 相当）。 */
function splitKeepingLineEndings(text: string): readonly string[] {
  return text.match(/[^\n]*\n|[^\n]+/g) ?? []
}
