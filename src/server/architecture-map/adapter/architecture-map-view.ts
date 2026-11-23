// 作業ディレクトリの地図のファイルを読み、選んだ縮尺・箱の図にして画面への応答の形にする。

import type { MapSelection, MapViewResponse } from "../../../shared/architecture-map/map-view.ts"
import { mapViewOf } from "../core/map-view.ts"
import { readArchitectureMapFile } from "./architecture-map-file.ts"

export async function readMapView(cwd: string, selection: MapSelection): Promise<MapViewResponse> {
  const read = await readArchitectureMapFile(cwd)
  return read.kind === "map" ? mapViewOf(read.map, selection) : read
}
