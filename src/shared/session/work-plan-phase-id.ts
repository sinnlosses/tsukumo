// `work_plan` の段に添える段の id の形と検査、並びを名前の並びと平らにした id の並びへ写す決まり。

import { z } from "zod"

import { isBlankText } from "../utils/blank-text.ts"

const nonBlankTextSchema = z.string().refine((text) => !isBlankText(text))

/** `work_plan` の段1つ。名前だけか、段の id と名前の組。 */
export const phaseElementSchema = z.union([
  nonBlankTextSchema,
  z.object({ id: nonBlankTextSchema, name: nonBlankTextSchema }),
])

type PhaseElement = z.infer<typeof phaseElementSchema>

type PhaseElementEntry = PhaseElement | readonly PhaseElement[]

/** 段の名前の並び。並列のフェーズは名前の配列のまま写す。 */
export function phaseNameEntriesOf(
  entries: readonly PhaseElementEntry[],
): readonly (string | readonly string[])[] {
  return entries.map((entry) => (isGroup(entry) ? entry.map(phaseNameOf) : phaseNameOf(entry)))
}

/** 平らにした読み順の段の id。どの段にも id が無ければ空。 */
export function phaseIdsOf(entries: readonly PhaseElementEntry[]): readonly string[] {
  return flatElements(entries).flatMap((element) =>
    typeof element === "string" ? [] : [element.id],
  )
}

/** 段の id が、全部の段にあって重ならないか、どの段にも無いか。 */
export function hasConsistentPhaseIds(entries: readonly PhaseElementEntry[]): boolean {
  const ids = phaseIdsOf(entries)
  return (
    ids.length === 0 ||
    (ids.length === flatElements(entries).length && new Set(ids).size === ids.length)
  )
}

function flatElements(entries: readonly PhaseElementEntry[]): readonly PhaseElement[] {
  return entries.flatMap((entry) => (isGroup(entry) ? entry : [entry]))
}

function phaseNameOf(element: PhaseElement): string {
  return typeof element === "string" ? element : element.name
}

function isGroup(entry: PhaseElementEntry): entry is readonly PhaseElement[] {
  return Array.isArray(entry)
}
