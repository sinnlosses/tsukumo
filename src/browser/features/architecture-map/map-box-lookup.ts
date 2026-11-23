// 箱の索引から、印の ID（今の ID でも別名でもよい）の箱を引く。

import type { MapBoxIndexEntry } from "../../../shared/architecture-map/map-view.ts"

type MapBoxLookup =
  | { readonly kind: "found"; readonly box: MapBoxIndexEntry }
  | { readonly kind: "unknown" }

/** ID が今の箱の ID に当たればその箱、別名に当たれば今の箱。どちらでもなければ `unknown`。 */
export function resolveMapBox(boxes: readonly MapBoxIndexEntry[], id: string): MapBoxLookup {
  const box =
    boxes.find((candidate) => candidate.id === id) ??
    boxes.find((candidate) => candidate.aliases.includes(id))
  return box === undefined ? { kind: "unknown" } : { kind: "found", box }
}
