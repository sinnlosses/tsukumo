// 索引の箱を地図の図の中の箱に引き直して、会話で指された箱として選ぶ（または光らせる図だけを置く）。
// 大の箱は全体の図、中・小の箱は親の箱にフォーカスした図から引く（図の中に出てくる縮尺がそこだから）。

import type {
  MapBoxIndexEntry,
  MapView,
  MapViewBox,
} from "../../../shared/architecture-map/map-view.ts"
import { rpc } from "../../stores/rpc.ts"
import { useArchitectureMapSelection } from "./architecture-map-selection.ts"

export async function pointToBox(entry: MapBoxIndexEntry): Promise<void> {
  for (const found of await boxWithView(entry)) {
    useArchitectureMapSelection.getState().pointBox(found.box, found.view)
  }
}

/** 選びも指された回数も変えず、光らせる箱がある図だけを引いて置く（バッジに触れたときの口）。 */
export async function lightBoxView(entry: MapBoxIndexEntry): Promise<void> {
  for (const found of await boxWithView(entry)) {
    useArchitectureMapSelection.getState().setLitView(entry.id, found.view)
  }
}

type FoundBox = { readonly box: MapViewBox; readonly view: MapView }

/** 引けたら1件、引けなかったら空（バッジは出たまま何も起こさない）。 */
async function boxWithView(entry: MapBoxIndexEntry): Promise<readonly FoundBox[]> {
  const selection =
    entry.parent === undefined
      ? ({ kind: "level", level: 1 } as const)
      : ({ kind: "focus", box: entry.parent } as const)
  try {
    const response = await rpc.architectureMap.view.call(selection)
    if (response.kind !== "ready") {
      return []
    }
    const box = response.view.boxes.find((candidate) => candidate.id === entry.id)
    return box === undefined ? [] : [{ box, view: response.view }]
  } catch {
    // 引けなかったときは何も選ばず光らせない（バッジは出たまま）
    return []
  }
}
