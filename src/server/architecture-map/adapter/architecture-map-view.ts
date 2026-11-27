// 作業ディレクトリの地図のファイルを読み、選んだ縮尺・箱の図にして画面への応答の形にする。
// 図に出る箱の `links.adr` のファイルは、ここで読んで番号と題にする。

import { readFile } from "node:fs/promises"
import { isAbsolute, matchesGlob, relative, resolve } from "node:path"

import type {
  MapBoxIndexResponse,
  MapSelection,
  MapViewAdr,
  MapViewBox,
  MapViewResponse,
} from "../../../shared/architecture-map/map-view.ts"
import { adrEntryOf } from "../core/map-adr.ts"
import { mapBoxIndexOf } from "../core/map-box.ts"
import { type ChangeCommit, changeFrequencyOf } from "../core/map-change-frequency.ts"
import { entrypointsWithin } from "../core/map-entrypoint.ts"
import { fileCountOf } from "../core/map-file-count.ts"
import { mapViewOf } from "../core/map-view.ts"
import { readArchitectureMapFile } from "./architecture-map-file.ts"

/** git の管理下のファイルの一覧。空は「数えられない」とみなす。 */
export type ListFiles = () => Promise<readonly string[]>

/** 直近の commit の並び。`uncounted` は「数えられない」。 */
export type ChangeLog =
  | { readonly kind: "read"; readonly commits: readonly ChangeCommit[] }
  | { readonly kind: "uncounted" }

/** 地図の `source.commit` を渡して読む。 */
export type ReadChangeLog = (sourceCommit: string) => Promise<ChangeLog>

export async function readMapView(
  cwd: string,
  selection: MapSelection,
  listFiles: ListFiles,
  readChangeLog: ReadChangeLog,
): Promise<MapViewResponse> {
  const read = await readArchitectureMapFile(cwd)
  if (read.kind !== "map") {
    return read
  }
  const response = mapViewOf(read.map, selection)
  if (response.kind !== "ready") {
    return response
  }
  const files = await listFiles()
  const changeLog = await readChangeLog(read.map.source.commit)
  const boxes = await Promise.all(
    response.view.boxes.map(async (box) =>
      withChangeFrequency(
        withFileCount(withEntrypoints(await withAdrs(cwd, box)), files),
        changeLog,
      ),
    ),
  )
  return { ...response, view: { ...response.view, boxes } }
}

export async function readMapBoxes(cwd: string): Promise<MapBoxIndexResponse> {
  const read = await readArchitectureMapFile(cwd)
  return read.kind === "map" ? { kind: "ready", boxes: mapBoxIndexOf(read.map) } : read
}

function withFileCount(box: MapViewBox, files: readonly string[]): MapViewBox {
  if (box.external || files.length === 0) {
    return box
  }
  return { ...box, fileCount: fileCountOf(box.paths, files, matchesGlob) }
}

function withEntrypoints(box: MapViewBox): MapViewBox {
  if (box.entrypoints === undefined) {
    return box
  }
  const { entrypoints, ...rest } = box
  const within = entrypointsWithin(box.paths, entrypoints, matchesGlob)
  return within.length === 0 ? rest : { ...rest, entrypoints: within }
}

function withChangeFrequency(box: MapViewBox, log: ChangeLog): MapViewBox {
  if (box.external || log.kind === "uncounted") {
    return box
  }
  return { ...box, changeFrequency: changeFrequencyOf(box.paths, log.commits, matchesGlob) }
}

async function withAdrs(cwd: string, box: MapViewBox): Promise<MapViewBox> {
  const paths = box.links?.adr ?? []
  if (paths.length === 0) {
    return box
  }
  const adrs: readonly MapViewAdr[] = await Promise.all(
    paths.map(async (path) => adrEntryOf(path, await readInside(cwd, path))),
  )
  return { ...box, adrs }
}

/** 作業ディレクトリの中のファイルだけを読む。外を指す・読めないときは undefined。 */
async function readInside(cwd: string, path: string): Promise<string | undefined> {
  const target = resolve(cwd, path)
  const fromCwd = relative(cwd, target)
  if (fromCwd.startsWith("..") || isAbsolute(fromCwd)) {
    return undefined
  }
  try {
    return await readFile(target, "utf8")
  } catch {
    // 読めない ADR はパスをそのまま出す（地図の図は引ける）
    return undefined
  }
}
