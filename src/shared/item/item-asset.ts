// `/item/<file>` で配るアイテムの素材の、URL の作り方と読み方。
// 素材そのものは持たない。読む側・配る側・画面に載せる側が同じ経路名を見るための契約。

export const ITEM_ASSET_PATH_PREFIX = "/item/"

/**
 * `/item/<file>?v=<版>` の URL。ファイル名は1つの区間としてエンコードする。
 * `revision` は取り直させるためだけの問い合わせ文字列で、無ければ付けない。
 */
export function itemAssetPath(fileName: string, revision: string | undefined): string {
  const path = `${ITEM_ASSET_PATH_PREFIX}${encodeURIComponent(fileName)}`
  return revision === undefined ? path : `${path}?v=${encodeURIComponent(revision)}`
}

/**
 * {@link ITEM_ASSET_PATH_PREFIX} より後ろ（問い合わせ文字列を落としたもの）をファイル名に読む。
 * 区切りの `/` を含む・空・デコードできないものは undefined（配る側が 404 にする）。
 * 配ってよいかは一覧との突き合わせが決める。
 */
export function readItemAssetPath(rest: string): string | undefined {
  if (rest === "" || rest.includes("/")) {
    return undefined
  }
  try {
    const fileName = decodeURIComponent(rest)
    return fileName === "" ? undefined : fileName
  } catch {
    return undefined
  }
}
