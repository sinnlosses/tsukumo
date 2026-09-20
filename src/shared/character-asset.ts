// `/character/<file>` で配るキャラクターの素材（立ち絵）。**URL の作り方・取り直しの印・
// 拡張子による仕分け**を持つ。
//
// 素材そのものは持たない。読むのは `src/server/adapter/character-pack.ts`、配るのは
// `src/server/adapter/server.ts`、`<img>` に載せるのは `src/browser/components/portrait.tsx` で、
// ここはその3者が同じ経路名と同じ仕分けを見るための契約（`node:` にも `document` にも触らない）。

/**
 * `/character/<file>` の URL の作り方。**`character.json` に書かれたファイル名だけ**を渡す前提
 * （`src/server/adapter/character-pack.ts` の allowlist と同じ考え方。パスから組み立てない）。
 *
 * `cacheKey` は**ブラウザに再取得させるためだけ**の問い合わせ文字列（{@link characterAssetCacheKey}
 * が組み立てる）。2つのパックが同じファイル名（`default.png` など）を使うと URL が一致し、
 * `<img src>` が書き換わらないので再取得が起きない。**画面から立ち絵を差し替えたときも
 * ファイル名が同じまま中身だけが変わる**ので、パックの名前だけでは足りず素材の版も混ぜる。
 * **配る側（`src/server/adapter/server.ts`）はこの値を見ない**（`?` 以降を落としてから配信ファイルを
 * 決める）。中身を決めるのは呼び出し側が渡す `CharacterPack` のほう。
 */
export const CHARACTER_ASSET_PATH_PREFIX = "/character/"

export function characterAssetPath(fileName: string, cacheKey: string | undefined): string {
  const path = `${CHARACTER_ASSET_PATH_PREFIX}${fileName}`
  return cacheKey === undefined ? path : `${path}?v=${encodeURIComponent(cacheKey)}`
}

/**
 * 取り直しの印を組み立てる。パックの名前と素材の版（`revision`）を混ぜたもので、**どちらも
 * 無いときだけ undefined**（問い合わせ文字列そのものが付かない）。
 */
export function characterAssetCacheKey(
  pack: string | undefined,
  revision: string | undefined,
): string | undefined {
  const parts = [pack, revision].filter((part): part is string => part !== undefined)
  return parts.length === 0 ? undefined : parts.join("@")
}

/**
 * 立ち絵の種類を拡張子だけで分ける。**ファイル名でも `characterAssetPath` が返した URL でも
 * 受け取る**（`?v=` が付いていても拡張子を見失わない）。**利用者が `characters/local/` に置いた任意の
 * ファイルを無検証で流し込まないための最低限の仕分け**（このタスクの注意事項）。
 * SVG はインラインで埋め込む（ページの CSS 変数 `--outfit-accent` を効かせるため。
 * `<img>` で読み込むと独立した文書扱いになり届かない。実測は `characters/README.md`）。
 * それ以外は `<img>` で出す。対応しないラスタ形式（拡張子が既知のものでない）は undefined を返し、
 * 立ち絵なし扱いにする。
 */
export function classifyPortraitFile(fileName: string): "svg" | "raster" | undefined {
  const extension = fileExtension(fileName)
  if (extension === ".svg") {
    return "svg"
  }

  return RASTER_MIME_BY_EXTENSION[extension] === undefined ? undefined : "raster"
}

/** ラスタ画像の MIME タイプ。`classifyPortraitFile` が `"raster"` を返したときだけ意味を持つ。 */
export function rasterMimeType(fileName: string): string | undefined {
  return RASTER_MIME_BY_EXTENSION[fileExtension(fileName)]
}

const RASTER_MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  ".png": "image/png",
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
}

/**
 * 拡張子を小文字で返す。**問い合わせ文字列は落としてから見る**（`characterAssetPath` が
 * 付ける `?v=` で拡張子を見失わないため）。無ければ空文字。
 */
function fileExtension(fileName: string): string {
  const path = fileName.split("?")[0] ?? fileName
  const dotIndex = path.lastIndexOf(".")
  return dotIndex === -1 ? "" : path.slice(dotIndex).toLowerCase()
}
