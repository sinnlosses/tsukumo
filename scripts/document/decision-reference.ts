// `docs/history/decision.md` を「句」で引いている参照の句が、decision.md の見出しのどれかに
// 前方一致するかを照らす純粋関数。空白・バッククォート・強調を除き、末尾の「…」を外して比べる。

import {
  findSectionReferences,
  normalizeForMatch,
  type SectionReference,
  withoutTrailingEllipsis,
} from "./section-reference.ts"

export const DECISION_PATH = "docs/history/decision.md"

/** ファイル1つの本文から、decision.md を「句」で引いている参照を拾う。 */
export function findDecisionReferences(sourcePath: string, text: string): SectionReference[] {
  return findSectionReferences(sourcePath, text, (targetPath) => targetPath === DECISION_PATH)
}

/** decision.md の本文から見出し（`## `〜`###### `）の文字列を拾う。コードブロック内は除く。 */
export function readDecisionHeadings(text: string): string[] {
  const outsideFences = text.replace(/^```[\s\S]*?^```$/gmu, "")
  return outsideFences.split("\n").flatMap((line) => {
    const match = /^#{2,6}[ \t]+(.+)$/u.exec(line)
    return match?.[1] === undefined ? [] : [match[1]]
  })
}

/** 句が見出しのどれにも前方一致しない参照を返す。 */
export function findStrayDecisionReferences(
  references: readonly SectionReference[],
  headings: readonly string[],
): SectionReference[] {
  const normalizedHeadings = headings.map(normalizeForMatch)
  return references.filter((reference) => {
    const phrase = normalizeForMatch(withoutTrailingEllipsis(reference.phrase))
    return !normalizedHeadings.some((heading) => heading.startsWith(phrase))
  })
}

/** 食い違った参照1つを、落ちたときに出す1行にする。 */
export function formatStrayDecisionReference(stray: SectionReference): string {
  return `${stray.sourcePath}:${stray.line}: 「${stray.phrase}」が ${DECISION_PATH} の見出しに無い（見出しを grep して節名を合わせる）`
}
