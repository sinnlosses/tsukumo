// 作業ディレクトリの地図のファイルを読み、箱の定義（または大・中の一覧）にする。

import { mapBoxOf, type MapBoxOutcome } from "../core/map-box.ts"
import { type ArchitectureMapRead, readArchitectureMapFile } from "./architecture-map-file.ts"

export async function readMapBox(
  cwd: string,
  id?: string,
): Promise<MapBoxOutcome | Exclude<ArchitectureMapRead, { readonly kind: "map" }>> {
  const read = await readArchitectureMapFile(cwd)
  return read.kind === "map" ? mapBoxOf(read.map, id) : read
}
