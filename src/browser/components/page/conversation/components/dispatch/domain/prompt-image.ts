// 貼り付け・ドロップ・ファイルを選ぶ窓で届いたファイルを、依頼に添える画像（`PromptImage`）にする。
//
// 控えを作るのは「原寸を手放しても依頼の記録が読める」ようにするためで、押して拡大する面は作らない（作ろうとしても開くものが無い）。
//
// 読めなかった1枚は undefined にして呼び出し側が諦める（例外を投げない）。

import {
  isPromptImageMediaType,
  parsePromptImage,
  type PromptImage,
} from "../../../../../../../shared/session-driver/prompt-image.ts"
import { readDataUrl } from "../../../../../../utils/data-url.ts"
import { shrinkToThumbnail } from "../../../domain/prompt-image-thumbnail.ts"

/**
 * 落ちてきた・貼られたものから、依頼に添えられる画像のファイルだけを拾う（`.svg` や PDF やフォルダは混ざらない）。
 * 外来の `null` はここで undefined に畳む。
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
 * 掴んで持ってきているものがファイルか。
 * `dragover` の時点では中身（`files`）がまだ読めないので、ここだけは種類の並び（`types`）で見る（受け取れるかどうかは落ちたあとに {@link promptImageFiles} が決める）。
 */
export function carriesFiles(transfer: DataTransfer | null | undefined): boolean {
  return transfer !== null && transfer !== undefined && [...transfer.types].includes("Files")
}

/** ファイル1つを原寸と控えの対にする。読めない・受け付けない種類・大きすぎるときは undefined（その1枚だけを諦める）。 */
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
