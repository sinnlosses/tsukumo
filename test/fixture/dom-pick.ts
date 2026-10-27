// E2E の部分一致の期待値（`<シナリオ>.dom-pick.json`）を、DOM の木の写しに当てる。
// 記法と当て方の正典は `docs/architecture/testing/e2e-artifact-and-expectation.md`「部分一致の期待値」。

import { z } from "zod"

/** DOM の木の節。文字か、要素（`namedDomTreeScript` の写しと同じ形で、属性と子は無ければ空）。 */
export type DomNode = string | DomElement

export type DomElement = {
  readonly tag: string
  readonly attributes: Readonly<Record<string, string | boolean>>
  readonly children: readonly DomNode[]
}

/** 部分木の名前ごとの節の並び。写し（`*.dom.json`）と部分一致の期待値の両方がこの形。 */
export type DomTreeByRoot = Readonly<Record<string, readonly DomNode[]>>

/**
 * 写しの JSON を読む。部分一致の期待値も同じ形で読む（属性と子は省いてよい）。
 * 形が合わなければ `where` を添えて投げる。
 */
export function parseDomTreeByRoot(value: unknown, where: string): DomTreeByRoot {
  const parsed = domTreeByRootSchema.safeParse(value)
  if (!parsed.success) {
    throw new Error(`${where} が DOM の木の形でない: ${z.prettifyError(parsed.error)}`)
  }
  return parsed.data
}

/**
 * 期待値の節のうち、写しに見つからなかったものを `<部分木の名前>[<添字>]: <節>` の形で返す（全部見つかれば空）。
 * 名前と属性の合う要素が写しにあって子だけが見つからないときは、
 * `<部分木の名前>[<添字>].children[<添字>]: <節>` のように見つからない子まで降りて名指す。
 */
export function missingPicks(picked: DomTreeByRoot, actual: DomTreeByRoot): readonly string[] {
  return Object.entries(picked).flatMap(([rootName, picks]) => {
    const nodes = actual[rootName]
    if (nodes === undefined) {
      return [`${rootName}: 写しに無い部分木の名前（場面の domRoots に足す）`]
    }
    return missingLines(picks, nodes, rootName)
  })
}

const attributeValueSchema = z.union([z.string(), z.boolean()])

const domElementSchema = z.object({
  tag: z.string(),
  attributes: z.record(z.string(), attributeValueSchema).default({}),
  get children(): z.ZodDefault<z.ZodArray<typeof domNodeSchema>> {
    return z.array(domNodeSchema).default([])
  },
})

const domNodeSchema: z.ZodType<DomNode, unknown> = z.union([z.string(), domElementSchema])

const domTreeByRootSchema = z.record(z.string(), z.array(domNodeSchema))

function missingLines(
  picks: readonly DomNode[],
  nodes: readonly DomNode[],
  at: string,
): readonly string[] {
  const entries = inDocumentOrder(nodes, 0)
  return unmatchedPicks(picks, entries).flatMap(({ index, cursor }) => {
    const pick = picks[index]
    const where = `${at}[${String(index)}]`
    const deeper =
      pick === undefined || typeof pick === "string"
        ? []
        : missingChildLines(pick, entries.slice(cursor), where)
    return deeper.length > 0 ? deeper : [`${where}: ${describeNode(pick)}`]
  })
}

/** 名前と属性の合う最初の要素に降り、見つからない子を名指す（合う要素が無ければ空）。 */
function missingChildLines(
  pick: DomElement,
  entries: readonly OrderedEntry[],
  where: string,
): readonly string[] {
  const sameElement = entries.find((entry) => sameTagAndAttributes(pick, entry.node))?.node
  return sameElement === undefined || typeof sameElement === "string"
    ? []
    : missingLines(pick.children, sameElement.children, `${where}.children`)
}

/** 当たらなかった期待値の節の添字と、探し始めた位置。前の節が当たった部分木より後ろから、行きがけ順に探す。 */
function unmatchedPicks(
  picks: readonly DomNode[],
  entries: readonly OrderedEntry[],
): readonly { readonly index: number; readonly cursor: number }[] {
  const { unmatched } = picks.reduce<{
    readonly cursor: number
    readonly unmatched: readonly { readonly index: number; readonly cursor: number }[]
  }>(
    ({ cursor, unmatched: sofar }, pick, index) => {
      const entry = entries.find(
        (candidate, position) => position >= cursor && matches(pick, candidate.node),
      )
      return entry === undefined
        ? { cursor, unmatched: [...sofar, { index, cursor }] }
        : { cursor: entry.end, unmatched: sofar }
    },
    { cursor: 0, unmatched: [] },
  )
  return unmatched
}

function matches(pick: DomNode, node: DomNode): boolean {
  if (typeof pick === "string" || typeof node === "string") {
    return pick === node
  }
  return (
    sameTagAndAttributes(pick, node) &&
    unmatchedPicks(pick.children, inDocumentOrder(node.children, 0)).length === 0
  )
}

function sameTagAndAttributes(pick: DomElement, node: DomNode): boolean {
  return (
    typeof node === "object" &&
    pick.tag === node.tag &&
    Object.entries(pick.attributes).every(([name, value]) => node.attributes[name] === value)
  )
}

/** 行きがけ順に並べた節と、その節の部分木の次の位置（`end`）。 */
type OrderedEntry = { readonly node: DomNode; readonly end: number }

function inDocumentOrder(nodes: readonly DomNode[], start: number): readonly OrderedEntry[] {
  return nodes.reduce<readonly OrderedEntry[]>((entries, node) => {
    const at = start + entries.length
    const inner = typeof node === "string" ? [] : inDocumentOrder(node.children, at + 1)
    return [...entries, { node, end: at + 1 + inner.length }, ...inner]
  }, [])
}

/** 失敗の行に出す節の長さの上限。 */
const DESCRIBED_NODE_LENGTH_LIMIT = 120

function describeNode(node: DomNode | undefined): string {
  const text = JSON.stringify(node) ?? "(無し)"
  return text.length > DESCRIBED_NODE_LENGTH_LIMIT
    ? `${text.slice(0, DESCRIBED_NODE_LENGTH_LIMIT)}…`
    : text
}
