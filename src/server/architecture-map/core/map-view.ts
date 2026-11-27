// 読んだ地図から、縮尺1つ・またはフォーカスした箱1つの図を作る。束ね方・描く範囲・覆い方は `docs/architecture/architecture-map.md` の「tsukumo が読む意味」。
// 実際のエッジは小の段だけにあり、図の段の祖先の箱へ置き換えて本数を足す。

import type {
  ArchitectureMap,
  IntendedEdge,
  MapLevel,
  MapLinks,
  MapPlace,
} from "../../../shared/architecture-map/architecture-map.ts"
import type {
  MapReady,
  MapSelection,
  MapView,
  MapViewBox,
  MapViewLane,
} from "../../../shared/architecture-map/map-view.ts"

export type MapViewOutcome =
  | MapReady
  | { readonly kind: "unfocusable"; readonly reason: "unknown-box" | "no-children" }

/** 選び方どおりの図を作る。フォーカスした箱が無い・子を持たないときは図にせず理由で返す。 */
export function mapViewOf(map: ArchitectureMap, selection: MapSelection): MapViewOutcome {
  const index = boxIndexOf(map.boxes)
  if (selection.kind === "level") {
    const view = levelView(map, index, selection.level)
    return ready(map, view, selection.level === 1)
  }
  const focus = index.nodes.get(index.aliases.get(selection.box) ?? selection.box)
  if (focus === undefined) {
    return { kind: "unfocusable", reason: "unknown-box" }
  }
  if (focus.childIds.length === 0) {
    return { kind: "unfocusable", reason: "no-children" }
  }
  return ready(map, focusView(map, index, focus), false)
}

export function boxIndexOf(boxes: readonly BoxFields[]): BoxIndex {
  const nodes = new Map<string, BoxNode>()
  const order: BoxNode[] = []
  const aliases = new Map<string, string>()
  const visit = (box: BoxFields, level: MapLevel, parentId?: string, parentLane?: string) => {
    const children = box.children ?? []
    const lane = box.lane ?? parentLane
    const node: BoxNode = {
      id: box.id,
      level,
      ...(lane === undefined ? {} : { lane }),
      ...(parentId === undefined ? {} : { parentId }),
      childIds: children.map((child) => child.id),
      title: box.title ?? box.id,
      ...(box.summary === undefined ? {} : { summary: box.summary }),
      ...(box.purpose === undefined ? {} : { purpose: box.purpose }),
      ...(box.overview === undefined ? {} : { overview: box.overview }),
      paths: box.paths ?? [],
      ...(box.place === undefined ? {} : { place: box.place }),
      ...(box.links === undefined ? {} : { links: box.links }),
      ...(box.entrypoints === undefined ? {} : { entrypoints: box.entrypoints }),
      external: box.external === true,
    }
    nodes.set(node.id, node)
    order.push(node)
    for (const alias of box.aliases ?? []) {
      aliases.set(alias, box.id)
    }
    // 小の箱は子を持たないので、3 の下の段は作られない
    for (const child of children) {
      visit(child, level === 1 ? 2 : 3, box.id, lane)
    }
  }
  for (const box of boxes) {
    visit(box, 1)
  }
  return { nodes, order, aliases }
}

function ready(map: ArchitectureMap, view: MapView, withOverview: boolean): MapReady {
  return {
    kind: "ready",
    source: map.source,
    ...(withOverview && map.overview !== undefined ? { overview: map.overview } : {}),
    view,
  }
}

/**
 * エッジの端を図の段の箱へ置き換えた結果。`inside` は図の段の箱として描くもの、そうでなければフォーカスの外の箱。
 * 図の段より粗い箱・フォーカスした箱そのものは置き換えられず、`dropped`。
 */
type End =
  | { readonly kind: "box"; readonly id: string; readonly inside: boolean }
  | { readonly kind: "dropped" }

const DROPPED = { kind: "dropped" } as const satisfies End

type Resolve = (id: string) => End

function levelView(map: ArchitectureMap, index: BoxIndex, level: MapLevel): MapView {
  const resolve: Resolve = (id) => {
    const found = ancestorAt(index, id, level)
    return found.kind === "found" ? { kind: "box", id: found.node.id, inside: true } : DROPPED
  }
  const boxes = index.order.filter((node) => node.level === level)
  return viewOf(map, index, { level, boxes: boxes.map((node) => node.id), resolve })
}

/** 子を持つ箱（大か中）へのフォーカス。 */
function focusView(map: ArchitectureMap, index: BoxIndex, focus: BoxNode): MapView {
  const childLevel = focus.level === 1 ? 2 : 3
  const resolve: Resolve = (id) => {
    if (id === focus.id) {
      return DROPPED
    }
    if (isWithin(index, id, focus.id)) {
      const child = ancestorAt(index, id, childLevel)
      return child.kind === "found" ? { kind: "box", id: child.node.id, inside: true } : DROPPED
    }
    const outer = ancestorAt(index, id, focus.level)
    return outer.kind === "found" ? { kind: "box", id: outer.node.id, inside: false } : DROPPED
  }
  return viewOf(map, index, { level: childLevel, focus, boxes: focus.childIds, resolve })
}

type ViewPlan = {
  readonly level: MapLevel
  readonly focus?: BoxNode
  /** 図の段の箱のうち、エッジが無くても描くもの。 */
  readonly boxes: readonly string[]
  readonly resolve: Resolve
}

function viewOf(map: ArchitectureMap, index: BoxIndex, plan: ViewPlan): MapView {
  const bundled = bundleActualEdges(map, plan.resolve)
  const intended = replaceIntendedEdges(map, plan.resolve)
  const undeclared = undeclaredEdgesOf(map, plan.resolve)
  const outerIds = new Set(
    [...bundled.edges, ...intended].flatMap((edge) => [edge.from, edge.to]).filter(isOuterOf(plan)),
  )
  const drawn = new Set([...plan.boxes, ...outerIds])
  const problems = boxProblemsOf(map, undeclared, drawn)
  return {
    level: plan.level,
    ...(map.lanes === undefined ? {} : { lanes: map.lanes.map(viewLaneOf) }),
    ...(plan.focus === undefined
      ? {}
      : {
          focus: {
            id: plan.focus.id,
            title: plan.focus.title,
            ...(plan.focus.summary === undefined ? {} : { summary: plan.focus.summary }),
            level: plan.focus.level,
            ...(plan.focus.lane === undefined ? {} : { lane: plan.focus.lane }),
          },
        }),
    boxes: index.order
      .filter((node) => drawn.has(node.id))
      .map((node) => viewBoxOf(index, node, problems.get(node.id) ?? [])),
    edges: bundled.edges.map((edge) => ({
      ...edge,
      undeclared: undeclared.keys.has(edgeKey(edge.from, edge.to)),
    })),
    intendedEdges: intended,
    closedCount: bundled.closedCount,
    findings: map.findings,
  }
}

function isOuterOf(plan: ViewPlan): (id: string) => boolean {
  const own = new Set(plan.boxes)
  return (id) => !own.has(id)
}

type BundledEdges = {
  readonly edges: readonly { readonly from: string; readonly to: string; readonly count: number }[]
  /** 両端が図の中の同じ箱になった import の本数。 */
  readonly closedCount: number
}

function bundleActualEdges(map: ArchitectureMap, resolve: Resolve): BundledEdges {
  const counts = new Map<string, { from: string; to: string; count: number }>()
  let closedCount = 0
  for (const edge of map.edges.actual) {
    const from = resolve(edge.from)
    const to = resolve(edge.to)
    if (from.kind !== "box" || to.kind !== "box" || (!from.inside && !to.inside)) {
      continue
    }
    if (from.id === to.id) {
      closedCount += edge.count
      continue
    }
    const key = edgeKey(from.id, to.id)
    const bundled = counts.get(key) ?? { from: from.id, to: to.id, count: 0 }
    counts.set(key, { ...bundled, count: bundled.count + edge.count })
  }
  return { edges: [...counts.values()], closedCount }
}

function replaceIntendedEdges(map: ArchitectureMap, resolve: Resolve): MapView["intendedEdges"] {
  const replaced = new Map<string, MapView["intendedEdges"][number]>()
  for (const edge of map.edges.intended) {
    for (const ends of endsOf(edge.from, edge.to, resolve)) {
      replaced.set(replacedKey(edge, ends), {
        from: ends.from,
        to: ends.to,
        ...(edge.label === undefined ? {} : { label: edge.label }),
        ...(edge.origin === undefined ? {} : { origin: edge.origin }),
      })
    }
  }
  return [...replaced.values()]
}

function replacedKey(edge: IntendedEdge, ends: { readonly from: string; readonly to: string }) {
  return [ends.from, ends.to, edge.label ?? "", edge.origin ?? ""].join("\0")
}

type Undeclared = {
  /** 図の段に置き換えた両端の `edgeKey`。 */
  readonly keys: ReadonlySet<string>
  /** 赤で描く両端の箱。 */
  readonly boxIds: ReadonlySet<string>
}

function undeclaredEdgesOf(map: ArchitectureMap, resolve: Resolve): Undeclared {
  const keys = new Set<string>()
  const boxIds = new Set<string>()
  for (const finding of map.findings) {
    if (finding.kind !== "undeclared-edge") {
      continue
    }
    for (const ends of endsOf(finding.from, finding.to, resolve)) {
      keys.add(edgeKey(ends.from, ends.to))
      boxIds.add(ends.from)
      boxIds.add(ends.to)
    }
  }
  return { keys, boxIds }
}

/**
 * 図の段に置き換えた両端（1組）。
 * どちらかを置き換えられない・両端が同じ箱・両端がフォーカスの外のときは、図に描けないので空。
 */
function endsOf(
  from: string,
  to: string,
  resolve: Resolve,
): readonly { readonly from: string; readonly to: string }[] {
  const start = resolve(from)
  const end = resolve(to)
  if (start.kind !== "box" || end.kind !== "box" || start.id === end.id) {
    return []
  }
  return start.inside || end.inside ? [{ from: start.id, to: end.id }] : []
}

type BoxProblem = MapViewBox["problems"][number]

/** 図に描く箱ごとの、赤で描く理由。 */
function boxProblemsOf(
  map: ArchitectureMap,
  undeclared: Undeclared,
  drawn: ReadonlySet<string>,
): ReadonlyMap<string, readonly BoxProblem[]> {
  const problems = new Map<string, BoxProblem[]>()
  const note = (id: string, problem: BoxProblem) => {
    if (drawn.has(id) && !(problems.get(id) ?? []).includes(problem)) {
      problems.set(id, [...(problems.get(id) ?? []), problem])
    }
  }
  for (const finding of map.findings) {
    if (finding.kind === "empty-box" || finding.kind === "missing-link") {
      note(finding.box, finding.kind)
    }
  }
  for (const id of undeclared.boxIds) {
    note(id, "undeclared-edge")
  }
  return problems
}

function viewLaneOf(lane: NonNullable<ArchitectureMap["lanes"]>[number]): MapViewLane {
  return { id: lane.id, title: lane.title ?? lane.id, kind: lane.kind }
}

function viewBoxOf(index: BoxIndex, node: BoxNode, problems: readonly BoxProblem[]): MapViewBox {
  return {
    id: node.id,
    title: node.title,
    ...(node.summary === undefined ? {} : { summary: node.summary }),
    ...(node.purpose === undefined ? {} : { purpose: node.purpose }),
    ...(node.overview === undefined ? {} : { overview: node.overview }),
    level: node.level,
    external: node.external,
    hasChildren: node.childIds.length > 0,
    ...(node.external ? {} : { childCount: node.childIds.length }),
    paths: node.paths,
    foldedPaths: foldedPathsOf(index, node),
    ...(node.place === undefined ? {} : { place: node.place }),
    ...(node.lane === undefined ? {} : { lane: node.lane }),
    ...(node.links === undefined ? {} : { links: node.links }),
    ...(node.entrypoints === undefined ? {} : { entrypoints: node.entrypoints }),
    problems,
  }
}

/**
 * 箱の paths を、親のディレクトリへ遡って畳んだ glob の並び。
 * 自分・子孫・祖先以外の箱のパスがそのディレクトリの下（再帰の glob で終わるパスは上も）に1つも無い間だけ遡り、
 * 届いたディレクトリの再帰の glob にする。
 * 根直下のファイルと、ほかの箱が同居するディレクトリのパスは畳まない。
 */
function foldedPathsOf(index: BoxIndex, node: BoxNode): readonly string[] {
  const otherDirs = index.order
    .filter(
      (other) =>
        other.id !== node.id &&
        !isWithin(index, other.id, node.id) &&
        !isWithin(index, node.id, other.id),
    )
    .flatMap((other) => other.paths)
    .map((path) => ({ dir: literalDirOf(path), recursive: path.endsWith("**") }))
    .filter((other) => other.dir.length > 0)
  const isFree = (dir: readonly string[]) =>
    !otherDirs.some(
      (other) => startsWith(other.dir, dir) || (other.recursive && startsWith(dir, other.dir)),
    )
  const folded = node.paths.map((path) => {
    let dir = literalDirOf(path)
    if (dir.length === 0 || !isFree(dir)) {
      return path
    }
    while (dir.length > 1 && isFree(dir.slice(0, -1))) {
      dir = dir.slice(0, -1)
    }
    return `${dir.join("/")}/**`
  })
  return [...new Set(folded)]
}

/** glob の最後の区切りを除いた、ワイルドカードを含まない頭の区切りの並び。 */
function literalDirOf(path: string): readonly string[] {
  const directories = path.split("/").slice(0, -1)
  const wildcard = directories.findIndex((segment) => segment.includes("*"))
  return wildcard === -1 ? directories : directories.slice(0, wildcard)
}

/** `path` が `prefix` の下（同じ場所を含む）か。 */
function startsWith(path: readonly string[], prefix: readonly string[]): boolean {
  return prefix.length <= path.length && prefix.every((segment, i) => path[i] === segment)
}

function edgeKey(from: string, to: string): string {
  return `${from}\0${to}`
}

type BoxFields = {
  readonly id: string
  readonly title?: string
  readonly summary?: string
  readonly purpose?: string
  readonly overview?: string
  readonly paths?: readonly string[]
  readonly place?: MapPlace
  readonly links?: MapLinks
  readonly entrypoints?: readonly string[]
  readonly aliases?: readonly string[]
  readonly external?: boolean
  readonly lane?: string
  readonly children?: readonly BoxFields[]
}

export type BoxNode = {
  readonly id: string
  readonly level: MapLevel
  readonly parentId?: string
  /** 大の祖先（自身を含む）が属する区画の `id`。 */
  readonly lane?: string
  readonly childIds: readonly string[]
  readonly title: string
  readonly summary?: string
  readonly purpose?: string
  readonly overview?: string
  readonly paths: readonly string[]
  readonly place?: MapPlace
  readonly links?: MapLinks
  readonly entrypoints?: readonly string[]
  readonly external: boolean
}

export type BoxIndex = {
  readonly nodes: ReadonlyMap<string, BoxNode>
  /** 定義の順（親の次に子）。 */
  readonly order: readonly BoxNode[]
  /** 別名から今の ID。 */
  readonly aliases: ReadonlyMap<string, string>
}

type Lookup = { readonly kind: "found"; readonly node: BoxNode } | { readonly kind: "none" }

/** `id` の箱を含む `level` の段の箱（`id` 自身を含む）。`id` が `level` より粗い段にある・`id` の箱が無いときは `none`。 */
function ancestorAt(index: BoxIndex, id: string, level: MapLevel): Lookup {
  let node = index.nodes.get(id)
  while (node !== undefined && node.level > level) {
    node = node.parentId === undefined ? undefined : index.nodes.get(node.parentId)
  }
  return node?.level === level ? { kind: "found", node } : { kind: "none" }
}

/** `id` の箱が `ancestorId` の箱の子孫か（自身は含まない）。 */
function isWithin(index: BoxIndex, id: string, ancestorId: string): boolean {
  let parentId = index.nodes.get(id)?.parentId
  while (parentId !== undefined) {
    if (parentId === ancestorId) {
      return true
    }
    parentId = index.nodes.get(parentId)?.parentId
  }
  return false
}
