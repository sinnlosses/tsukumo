// 貼り付け・ドロップ・ファイルを選ぶ窓で届いたファイルを、依頼に添える画像（`src/shared/prompt-image.ts` の
// `PromptImage`）にする（`docs/requirements.md` 4.10）。
//
// **縮めるのはここ（ブラウザ側）だけ。** サーバは受け取った控えをそのまま記録に載せるので、
// 原寸が残る場所はどこにも無い。控えを作るのは「原寸を手放しても依頼の記録が読める」ように
// するためで、**押して拡大する面は作らない**（作ろうとしても開くものが無い）。
//
// 読めなかった1枚は undefined にして呼び出し側が諦める（例外を投げない。**画面は1回の失敗で
// 落ちない**。`docs/coding-standards.md`「エラーハンドリング」）。
//
// **読むのは入力欄（`components/page/conversation/dispatch/`）だけ**なので機能の中に置く（`docs/design.md` 2章
// 「その機能しか読まないなら機能の中」。**2つ目の機能が読み始めたら `browser/lib/` へ上げる**）。
// フックではないので `hooks/` には置かず、機能の直下に概念の名前で置く。

import {
  isPromptImageMediaType,
  parsePromptImage,
  parsePromptImageThumbnail,
  type PromptImage,
} from "../../../../../shared/prompt-image.ts"
import { readDataUrl } from "../../../../lib/data-url.ts"

/**
 * 控えの長いほうの辺（px）。**記録に残り続けるものなので小さく持つ**
 * （`MAX_PROMPT_IMAGE_THUMBNAIL_BYTES` に対して十分な余裕がある）。札にも控えにも、この1枚を
 * そのまま出す。
 */
const THUMBNAIL_MAX_EDGE_PX = 320

/** 控えの形式。**受け付ける4つのうち、同じ絵をいちばん小さく持てるもの。** */
const THUMBNAIL_MEDIA_TYPE = "image/webp"

const THUMBNAIL_QUALITY = 0.8

/**
 * 落ちてきた・貼られたものから、**依頼に添えられる画像のファイルだけ**を拾う
 * （`.svg` や PDF やフォルダは混ざらない）。外来の `null` はここで undefined に畳む。
 */
export function promptImageFiles(transfer: DataTransfer | null | undefined): readonly File[] {
  return transfer === null || transfer === undefined
    ? []
    : [...transfer.files].filter((file) => isPromptImageMediaType(file.type))
}

/**
 * ファイルを選ぶ窓（`<input type="file">`）で選ばれたものから、依頼に添えられる画像だけを拾う。
 * 外来の `null`（何も選ばなかった）はここで空に畳む。
 */
export function chosenPromptImageFiles(files: FileList | null): readonly File[] {
  return files === null ? [] : [...files].filter((file) => isPromptImageMediaType(file.type))
}

/**
 * 掴んで持ってきているものがファイルか。**`dragover` の時点では中身（`files`）がまだ読めない**
 * ので、ここだけは種類の並び（`types`）で見る（受け取れるかどうかは落ちたあとに
 * {@link promptImageFiles} が決める）。
 */
export function carriesFiles(transfer: DataTransfer | null | undefined): boolean {
  return transfer !== null && transfer !== undefined && [...transfer.types].includes("Files")
}

/**
 * ファイル1つを**原寸と控えの対**にする。読めない・受け付けない種類・大きすぎるときは
 * undefined（その1枚だけを諦める）。
 */
export async function readPromptImage(file: File): Promise<PromptImage | undefined> {
  if (!isPromptImageMediaType(file.type)) {
    return undefined
  }

  const full = await readDataUrl(file)
  if (full === undefined || parsePromptImage(full) === undefined) {
    return undefined
  }

  const thumbnail = await shrinkToThumbnail(full)
  return thumbnail === undefined ? undefined : { full, thumbnail }
}

/**
 * 原寸の data URL から控えを作る。長いほうの辺を {@link THUMBNAIL_MAX_EDGE_PX} に収め、
 * **上限に収まったものだけ**を返す（収まらなければその1枚を諦める）。
 */
async function shrinkToThumbnail(full: string): Promise<string | undefined> {
  const decoded = await decodeImage(full)
  if (decoded === undefined) {
    return undefined
  }

  const longestEdge = Math.max(decoded.naturalWidth, decoded.naturalHeight)
  if (longestEdge === 0) {
    return undefined
  }

  const scale = Math.min(1, THUMBNAIL_MAX_EDGE_PX / longestEdge)
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(decoded.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(decoded.naturalHeight * scale))

  const context = canvas.getContext("2d")
  if (context === null) {
    return undefined
  }
  context.drawImage(decoded, 0, 0, canvas.width, canvas.height)

  const thumbnail = canvas.toDataURL(THUMBNAIL_MEDIA_TYPE, THUMBNAIL_QUALITY)
  return parsePromptImageThumbnail(thumbnail) === undefined ? undefined : thumbnail
}

/** data URL を読み込んだ `<img>`。読めなければ undefined（例外にしない）。 */
function decodeImage(dataUrl: string): Promise<HTMLImageElement | undefined> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => {
      resolve(image)
    }
    image.onerror = () => {
      resolve(undefined)
    }
    image.src = dataUrl
  })
}
