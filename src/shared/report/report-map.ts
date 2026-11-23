// 最終レポートの「変えたファイル」に添える、レポートの時点の地図の形。
// サーバが作業ディレクトリの地図のファイルから作って運ぶ。変えたファイルがどの箱に属するかと、ずれたエッジは、ここに入った値だけを画面が読む。

import type { MapView } from "../architecture-map/map-view.ts"
import type { ChangedFile } from "./changed-file.ts"

/** 地図に無い依存（`undeclared-edge`）1本。両端は地図の箱の ID、`sample` は import の実例。 */
export type ReportMapDrift = {
  readonly from: string
  readonly to: string
  readonly sample: { readonly from: string; readonly to: string }
}

/** 変えたファイル1つが当たった箱。`boxes` は大から小の順に並べた箱の ID。 */
export type ReportMapFile = {
  readonly path: string
  readonly boxes: readonly string[]
}

/**
 * レポートの時点の地図。
 * `view` は縮尺が大の全体の図で、木が地図のファイルの `source.tree` と一致したときだけ赤の印（`problems`・`undeclared`）を残す。
 * `drift` も同じ条件のときだけ入る。どの箱にも当たらないファイルは `files` に入らない。
 */
export type ReportMap = {
  readonly view: MapView
  readonly files: readonly ReportMapFile[]
  readonly drift: readonly ReportMapDrift[]
}

/** 地図を読んだ結果。地図が無いときは `none`。 */
export type ReportMapRead =
  | { readonly kind: "none" }
  | { readonly kind: "mapped"; readonly map: ReportMap }

/** 大の箱1つの、追加と、それ以外（変更・削除）の件数。 */
export type BoxChangeCount = {
  readonly added: number
  readonly other: number
}

/** 縮尺が大の箱ごとの件数。変えたファイルが無い箱は入らない。 */
export function changedBoxCountsOf(
  map: ReportMap,
  changed: readonly ChangedFile[],
): ReadonlyMap<string, BoxChangeCount> {
  const boxesOf = new Map(map.files.map((file) => [file.path, file.boxes]))
  const counts = new Map<string, BoxChangeCount>()
  for (const file of changed) {
    const large = boxesOf.get(file.path)?.[0]
    if (large === undefined) {
      continue
    }
    const count = counts.get(large) ?? { added: 0, other: 0 }
    counts.set(
      large,
      file.change === "added"
        ? { ...count, added: count.added + 1 }
        : { ...count, other: count.other + 1 },
    )
  }
  return counts
}

/** `boxId`（大・中・小のどれでも）の箱に属する変えたファイルのパス。 */
export function filesInBox(map: ReportMap, boxId: string): ReadonlySet<string> {
  return new Set(map.files.filter((file) => file.boxes.includes(boxId)).map((file) => file.path))
}
