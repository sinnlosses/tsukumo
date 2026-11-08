// 指した所つきの補足（「聞く」の問いと答え）を、部品ごとの束と親のカードの欄に残す並びに分ける。
// 答え待ち・答えたは補足の並びから求めるだけで、どこにも保存しない。

import type { MainViewAside, MainViewStep } from "../../../../shared/session/main-view-shape.ts"

/** 部品の束を引く鍵。レポートの呼び出しの ID と部品の ID の対。 */
export function askLeafKey(reportToolUseId: string, componentId: string): string {
  return `${reportToolUseId}\u0000${componentId}`
}

export type AskPair = {
  readonly question: string
  readonly answer: MainViewAside["answer"]
  /** 行を指したときだけ。`index` は書き手が書いた並びでの添字。 */
  readonly row?: { readonly index: number; readonly label: string }
}

export type LeafAskThread = {
  readonly pairs: readonly AskPair[]
  readonly waiting: boolean
  readonly count: number
}

/** 親のカードの欄に残す補足。`pointed` は鍵の部品が画面に無いときだけ付く指した所の字。 */
export type RemainingAside = {
  readonly aside: MainViewAside
  readonly pointed?: string
}

export type AskThreads = {
  readonly byLeaf: ReadonlyMap<string, LeafAskThread>
  readonly remaining: readonly RemainingAside[]
}

/** 画面に描かれているレポートの部品の鍵の集合。 */
export function drawnLeafKeys(steps: readonly MainViewStep[]): ReadonlySet<string> {
  const keys = new Set<string>()
  for (const step of steps) {
    if (step.body.kind !== "text" || step.origin.kind !== "tool-report") {
      continue
    }
    const { report } = step.body
    if (report.kind !== "regions" || report.a2ui.kind !== "surface") {
      continue
    }
    for (const part of report.a2ui.components) {
      keys.add(askLeafKey(step.origin.toolUseId, part.id))
    }
  }
  return keys
}

/** 古い順に並べた補足。`own` は画面に出しているやり取りの補足か（親のカードの欄に残すのはこちらだけ）。 */
export type AskSource = { readonly aside: MainViewAside; readonly own: boolean }

export function groupAsks(sources: readonly AskSource[], drawn: ReadonlySet<string>): AskThreads {
  const pairsByLeaf = new Map<string, AskPair[]>()
  const remaining: RemainingAside[] = []
  for (const { aside, own } of sources) {
    const { target } = aside
    if (target === undefined) {
      if (own) {
        remaining.push({ aside })
      }
      continue
    }
    const leafKey = askLeafKey(target.key.reportToolUseId, target.key.componentId)
    if (!drawn.has(leafKey)) {
      if (own) {
        remaining.push({ aside, pointed: pointedText(target.label) })
      }
      continue
    }
    const pair: AskPair = {
      question: aside.text,
      answer: aside.answer,
      ...(target.key.rowIndex === undefined
        ? {}
        : { row: { index: target.key.rowIndex, label: target.label.row ?? "" } }),
    }
    pairsByLeaf.set(leafKey, [...(pairsByLeaf.get(leafKey) ?? []), pair])
  }
  const byLeaf = new Map(
    [...pairsByLeaf].map(([leafKey, pairs]) => [
      leafKey,
      {
        pairs,
        waiting: pairs.some((pair) => pair.answer.kind === "waiting"),
        count: pairs.length,
      } satisfies LeafAskThread,
    ]),
  )
  return { byLeaf, remaining }
}

function pointedText(label: { readonly component: string; readonly row?: string }): string {
  return label.row === undefined ? label.component : `${label.component} ${label.row}`
}
