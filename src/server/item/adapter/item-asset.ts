// `/item/<file>` で配ってよい素材の1件を読む。
// 配ってよいのは `items.json` の `items` に載ったファイル名だけ（allowlist）。パスは受け取った名前から組まず、載っている名前だけを置き場に結ぶ。

import { readFileSync } from "node:fs"
import { join } from "node:path"

import { portraitImageMimeType } from "../../../shared/character-pack/character-asset.ts"
import { tsukumoHomePath } from "../../adapter/tsukumo-home.ts"
import { itemImageRevision, readItemsFile } from "./item-store.ts"

export type ServedItemAsset = {
  readonly contentType: string
  readonly content: Buffer
  /** 要求の `?v=` が今の版と一致したか。一致しない URL を長期にキャッシュさせない。 */
  readonly versioned: boolean
}

/** 載っていない・読めない・ディスクに無いは undefined。 */
export function readItemAsset(
  fileName: string,
  version: string | undefined,
  dir: string = tsukumoHomePath("items"),
): ServedItemAsset | undefined {
  const state = readItemsFile(dir)
  const entry =
    state.kind === "ok" ? state.file.items.find((item) => item.image === fileName) : undefined
  const contentType = entry === undefined ? undefined : portraitImageMimeType(entry.image)
  const revision = entry === undefined ? undefined : itemImageRevision(dir, entry.image)
  if (entry === undefined || contentType === undefined || revision === undefined) {
    return undefined
  }
  try {
    const content = readFileSync(join(dir, entry.image))
    return { contentType, content, versioned: version === revision }
  } catch {
    return undefined
  }
}
