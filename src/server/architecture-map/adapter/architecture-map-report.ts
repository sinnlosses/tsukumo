// 作業ディレクトリの地図を読み、レポートの時点の地図にする。glob の照合は node の `path.matchesGlob`。

import { matchesGlob } from "node:path"

import type { ChangedFile } from "../../../shared/report/changed-file.ts"
import type { ReportMapRead } from "../../../shared/report/report-map.ts"
import { type ReportTree, reportMapOf } from "../core/report-map.ts"
import { readArchitectureMapFile } from "./architecture-map-file.ts"

export async function readReportMap(
  cwd: string,
  changed: readonly ChangedFile[],
  tree: ReportTree,
): Promise<ReportMapRead> {
  const read = await readArchitectureMapFile(cwd)
  return read.kind === "map"
    ? { kind: "mapped", map: reportMapOf(read.map, changed, tree, matchesGlob) }
    : { kind: "none" }
}
