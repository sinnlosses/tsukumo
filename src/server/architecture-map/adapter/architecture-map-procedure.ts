// アーキテクチャの地図を引く手続き。形は `architectureMapContract`。照合は束ねる側のミドルウェアが済ませている。

import { implement } from "@orpc/server"

import type {
  MapBoxIndexResponse,
  MapSelection,
  MapViewResponse,
} from "../../../shared/architecture-map/map-view.ts"
import { architectureMapContract } from "../../../shared/contract/architecture-map.ts"

/** この機能の手続きが使う関数（中身は配線が渡す）。読みの失敗は投げずに、読めなかったときの値で返す。 */
export type ArchitectureMapProcedurePorts = {
  /** 選んだ縮尺・箱の図。地図が無い・読めない・箱が使えないときは理由つきの応答。 */
  readonly readArchitectureMapView: (selection: MapSelection) => Promise<MapViewResponse>
  /** 大・中・小の全部の箱の索引。地図が無い・読めないときは理由つきの応答。 */
  readonly readArchitectureMapBoxes: () => Promise<MapBoxIndexResponse>
}

export function architectureMapProcedure(ports: ArchitectureMapProcedurePorts) {
  const procedure = implement(architectureMapContract)
  return procedure.router({
    view: procedure.view.handler(({ input }) => ports.readArchitectureMapView(input)),
    boxes: procedure.boxes.handler(() => ports.readArchitectureMapBoxes()),
  })
}
