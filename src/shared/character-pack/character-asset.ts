// `/character/<pack>/<file>` で配るキャラクターの素材（立ち絵・顔・背景）の、URL の作り方と読み方・拡張子による仕分け。
// 素材そのものは持たない。読む側・配る側・画面に載せる側が同じ経路名と同じ仕分けを見るための契約。

export const CHARACTER_ASSET_PATH_PREFIX = "/character/"

/**
 * `/character/<pack>/<file>` の URL の作り方。使用中のパックもそれ以外も同じ形。
 * `fileName` は `character.json` に書かれたファイル名だけを渡す前提（パスから組み立てない）。
 * パック名もファイル名も1つの区間としてエンコードするので、`/` や空白を含んでも区切りがずれない（読むのは {@link readCharacterAssetPath}）。
 *
 * `revision` はブラウザに再取得させるためだけの問い合わせ文字列 `?v=<版>`。
 * 画面から立ち絵を差し替えるとファイル名が同じまま中身だけが変わるので、素材の版（更新時刻）を混ぜる。
 * 配る側はこの値を見ない（`?` 以降を落としてから配信ファイルを決める）。無ければ付けない。
 */
export function characterAssetPath(
  pack: string,
  fileName: string,
  revision: string | undefined,
): string {
  const path = `${CHARACTER_ASSET_PATH_PREFIX}${encodeURIComponent(pack)}/${encodeURIComponent(fileName)}`
  return revision === undefined ? path : `${path}?v=${encodeURIComponent(revision)}`
}

/** {@link readCharacterAssetPath} が読み出したもの。どちらもデコード済み。 */
export type CharacterAssetLocation = {
  readonly pack: string
  readonly fileName: string
}

/**
 * {@link CHARACTER_ASSET_PATH_PREFIX} より後ろ（問い合わせ文字列を落としたもの）を、パック名とファイル名に読み分ける。
 * 区切りの `/` がちょうど1つでないもの・どちらかが空のもの・デコードできないものは undefined（配る側が 404 にする）。
 * デコードした名前が `..` などでもここでは弾かない。
 * 配ってよいかは一覧と定義との突き合わせが決める（パスを組み立てないので、載っていない名前は自然に「無い」に落ちる）。
 */
export function readCharacterAssetPath(rest: string): CharacterAssetLocation | undefined {
  const segments = rest.split("/")
  if (segments.length !== 2) {
    return undefined
  }
  const [packSegment, fileSegment] = segments
  if (
    packSegment === undefined ||
    fileSegment === undefined ||
    packSegment === "" ||
    fileSegment === ""
  ) {
    return undefined
  }
  const pack = decodeSegment(packSegment)
  const fileName = decodeSegment(fileSegment)
  return pack === undefined || fileName === undefined ? undefined : { pack, fileName }
}

/**
 * 立ち絵の種類を拡張子だけで分ける。
 * ファイル名でも {@link characterAssetPath} が返した URL でも受け取る（`?v=` が付いていても拡張子を見失わない）。
 * 利用者が `characters/local/` に置いた任意のファイルを無検証で流し込まないための最低限の仕分け。
 * SVG はインラインで埋め込む（ページの CSS 変数 `--outfit-accent` を効かせるため。
 * `<img>` で読み込むと独立した文書扱いになり届かない。実測は `characters/README.md`）。
 * それ以外は `<img>` で出す。対応しないラスタ形式（拡張子が既知のものでない）は undefined を返し、立ち絵なし扱いにする。
 */
export function classifyPortraitFile(fileName: string): "svg" | "raster" | undefined {
  const extension = fileExtension(fileName)
  if (extension === ".svg") {
    return "svg"
  }

  return RASTER_MIME_BY_EXTENSION[extension] === undefined ? undefined : "raster"
}

/** ラスタ画像の MIME タイプ。{@link classifyPortraitFile} が `"raster"` を返したときだけ意味を持つ。 */
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
 * 拡張子を小文字で返す。無ければ空文字。
 * 問い合わせ文字列は落としてから見る（{@link characterAssetPath} が付ける `?v=` で拡張子を見失わないため）。
 */
function fileExtension(fileName: string): string {
  const path = fileName.split("?")[0] ?? fileName
  const dotIndex = path.lastIndexOf(".")
  return dotIndex === -1 ? "" : path.slice(dotIndex).toLowerCase()
}

/** URL の1区間をデコードする。壊れた `%` の並びは undefined（外来の例外は受け取ったここで畳む）。 */
function decodeSegment(segment: string): string | undefined {
  try {
    return decodeURIComponent(segment)
  } catch {
    return undefined
  }
}
