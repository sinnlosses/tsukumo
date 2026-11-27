// 作業ディレクトリの地図のファイルを読み、選んだ縮尺・箱の図にして画面への応答の形にする。
// 図に出る箱の `links.adr` のファイルは、ここで読んで番号と題にする。

import { readFile } from "node:fs/promises"
import { isAbsolute, relative, resolve } from "node:path"

import type {
  MapBoxIndexResponse,
  MapSelection,
  MapViewAdr,
  MapViewBox,
  MapViewResponse,
} from "../../../shared/architecture-map/map-view.ts"
import { adrEntryOf } from "../core/map-adr.ts"
import { mapBoxIndexOf } from "../core/map-box.ts"
import { mapViewOf } from "../core/map-view.ts"
import { readArchitectureMapFile } from "./architecture-map-file.ts"

export async function readMapView(cwd: string, selection: MapSelection): Promise<MapViewResponse> {
  const read = await readArchitectureMapFile(cwd)
  if (read.kind !== "map") {
    return read
  }
  const response = mapViewOf(read.map, selection)
  if (response.kind !== "ready") {
    return response
  }
  const boxes = await Promise.all(response.view.boxes.map((box) => withAdrs(cwd, box)))
  return { ...response, view: { ...response.view, boxes } }
}

export async function readMapBoxes(cwd: string): Promise<MapBoxIndexResponse> {
  const read = await readArchitectureMapFile(cwd)
  return read.kind === "map" ? { kind: "ready", boxes: mapBoxIndexOf(read.map) } : read
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
