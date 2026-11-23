// レポートの時点の地図を作る。変えたファイルを箱の木に当て、縮尺が大の全体の図と、ずれたエッジを添える。
// ずれ（赤の印と drift）は、作業ツリーの木が地図のファイルの `source.tree` と一致したときだけ残す。
// glob の照合は引数で受ける（core は node の組み込みを読まない）。

import type { ArchitectureMap } from "../../../shared/architecture-map/architecture-map.ts"
import type { MapView } from "../../../shared/architecture-map/map-view.ts"
import type { ChangedFile } from "../../../shared/report/changed-file.ts"
import type { ReportMap, ReportMapFile } from "../../../shared/report/report-map.ts"
import { type BoxIndex, boxIndexOf, mapViewOf } from "./map-view.ts"

/** レポートの時点の作業ツリーの木。取れなければ `unknown`。 */
export type ReportTree =
  | { readonly kind: "known"; readonly sha: string }
  | { readonly kind: "unknown" }

/** パス1つが glob に当たるか。 */
export type GlobMatches = (path: string, glob: string) => boolean

export function reportMapOf(
  map: ArchitectureMap,
  changed: readonly ChangedFile[],
  tree: ReportTree,
  matches: GlobMatches,
): ReportMap {
  const index = boxIndexOf(map.boxes)
  const files = changed.flatMap((file): readonly ReportMapFile[] => {
    const boxes = deepestChain(index, rootIds(index), file.path, matches)
    return boxes.length === 0 ? [] : [{ path: file.path, boxes }]
  })
  const outcome = mapViewOf(map, { kind: "level", level: 1 })
  if (outcome.kind !== "ready") {
    throw new Error("縮尺が大の図は必ず引ける")
  }
  const treeMatches =
    tree.kind === "known" && map.source.tree !== undefined && tree.sha === map.source.tree
  if (!treeMatches) {
    return { view: withoutDrift(outcome.view), files, drift: [] }
  }
  return {
    view: outcome.view,
    files,
    drift: map.findings.flatMap((finding) =>
      finding.kind === "undeclared-edge"
        ? [{ from: finding.from, to: finding.to, sample: finding.sample }]
        : [],
    ),
  }
}

function withoutDrift(view: MapView): MapView {
  return {
    ...view,
    boxes: view.boxes.map((box) => ({ ...box, problems: [] })),
    edges: view.edges.map((edge) => ({ ...edge, undeclared: false })),
    findings: [],
  }
}

function rootIds(index: BoxIndex): readonly string[] {
  return index.order.filter((node) => node.level === 1).map((node) => node.id)
}

/** 当たる箱の鎖（大から小）のうち最も深いもの。どれにも当たらなければ空。 */
function deepestChain(
  index: BoxIndex,
  candidates: readonly string[],
  path: string,
  matches: GlobMatches,
): readonly string[] {
  let best: readonly string[] = []
  for (const id of candidates) {
    const node = index.nodes.get(id)
    if (node === undefined || !node.paths.some((glob) => matches(path, glob))) {
      continue
    }
    const chain = [id, ...deepestChain(index, node.childIds, path, matches)]
    if (chain.length > best.length) {
      best = chain
    }
  }
  return best
}
