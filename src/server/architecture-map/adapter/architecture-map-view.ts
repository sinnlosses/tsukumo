// 作業ディレクトリの地図のファイルを読み、選んだ縮尺・箱の図にして画面への応答の形にする。

import type {
  MapBoxIndexResponse,
  MapSelection,
  MapViewResponse,
} from "../../../shared/architecture-map/map-view.ts"
import { mapBoxIndexOf } from "../core/map-box.ts"
import { mapViewOf } from "../core/map-view.ts"
import { readArchitectureMapFile } from "./architecture-map-file.ts"

export async function readMapView(cwd: string, selection: MapSelection): Promise<MapViewResponse> {
  const read = await readArchitectureMapFile(cwd)
  return read.kind === "map" ? mapViewOf(read.map, selection) : read
}

export async function readMapBoxes(cwd: string): Promise<MapBoxIndexResponse> {
  const read = await readArchitectureMapFile(cwd)
  return read.kind === "map" ? { kind: "ready", boxes: mapBoxIndexOf(read.map) } : read
}
