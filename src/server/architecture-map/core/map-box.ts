// 箱の定義（置き場・役割・つながり）を、地図のファイルだけから引く。作り手は呼ばない。エージェントの道具 `map_box` が返す中身。

import type {
  ArchitectureMap,
  MapLevel,
  MapLinks,
} from "../../../shared/architecture-map/architecture-map.ts"
import type { MapViewBox } from "../../../shared/architecture-map/map-view.ts"
import { type BoxNode, boxIndexOf, mapViewOf } from "./map-view.ts"

type BoxSummary = {
  readonly id: string
  readonly title: string
  readonly level: MapLevel
  readonly summary?: string
}

type BoxEdge = {
  /** 相手の箱の ID・表示名。 */
  readonly id: string
  readonly title: string
  /** `out` はこの箱から相手へ、`in` は相手からこの箱へ。 */
  readonly direction: "out" | "in"
  readonly count: number
}

export type MapBoxOutcome =
  | { readonly kind: "list"; readonly boxes: readonly BoxSummary[] }
  | {
      readonly kind: "box"
      readonly id: string
      readonly title: string
      readonly level: MapLevel
      readonly summary?: string
      readonly purpose?: string
      readonly overview?: string
      readonly paths: readonly string[]
      readonly links?: MapLinks
      readonly parent?: string
      readonly children: readonly string[]
      readonly edges: readonly BoxEdge[]
      readonly problems: MapViewBox["problems"]
    }
  | { readonly kind: "unknown-box" }

/** `id`（別名でもよい）が無ければ大・中の箱の一覧、あればその箱の定義。知らない ID は `unknown-box`。 */
export function mapBoxOf(map: ArchitectureMap, id?: string): MapBoxOutcome {
  const index = boxIndexOf(map.boxes)
  if (id === undefined) {
    return {
      kind: "list",
      boxes: index.order.filter((node) => node.level < 3).map(summaryOf),
    }
  }
  const node = index.nodes.get(index.aliases.get(id) ?? id)
  if (node === undefined) {
    return { kind: "unknown-box" }
  }
  const view = mapViewOf(map, { kind: "level", level: node.level })
  if (view.kind !== "ready") {
    return { kind: "unknown-box" }
  }
  const titleOf = (boxId: string) => index.nodes.get(boxId)?.title ?? boxId
  const edges = view.view.edges.flatMap((edge): BoxEdge[] => {
    if (edge.from === node.id) {
      return [{ id: edge.to, title: titleOf(edge.to), direction: "out", count: edge.count }]
    }
    return edge.to === node.id
      ? [{ id: edge.from, title: titleOf(edge.from), direction: "in", count: edge.count }]
      : []
  })
  return {
    kind: "box",
    id: node.id,
    title: node.title,
    level: node.level,
    ...(node.summary === undefined ? {} : { summary: node.summary }),
    ...(node.purpose === undefined ? {} : { purpose: node.purpose }),
    ...(node.overview === undefined ? {} : { overview: node.overview }),
    paths: node.paths,
    ...(node.links === undefined ? {} : { links: node.links }),
    ...(node.parentId === undefined ? {} : { parent: node.parentId }),
    children: node.childIds,
    edges,
    problems: view.view.boxes.find((box) => box.id === node.id)?.problems ?? [],
  }
}

function summaryOf(node: BoxNode): BoxSummary {
  return {
    id: node.id,
    title: node.title,
    level: node.level,
    ...(node.summary === undefined ? {} : { summary: node.summary }),
  }
}
