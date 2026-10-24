// 雑談の依頼に添えた画像の原寸を、パックの `images/` に1枚1ファイルで書く。
// 期限切れの掃除と置き場の親は `pruneChatImages` と `chatArchiveDir` が持つ。書けなくても例外を投げない。

import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"

import type { CharacterPackName } from "../../../shared/character-pack/character.ts"
import {
  parsePromptImage,
  promptImageIdSchema,
  type PromptImageMediaType,
} from "../../../shared/session-driver/prompt-image.ts"
import { localDateKey } from "../../adapter/local-time.ts"
import type { ChatArchiveImage, ChatArchiveImageWriteResult } from "../core/chat-archive-port.ts"

/** パックの下の、雑談の画像の置き場のディレクトリ名。 */
export const CHAT_IMAGE_DIR_NAME = "images"

/** 画像のファイルの拡張子。受け付ける形式の表（`PROMPT_IMAGE_MEDIA_TYPES`）と1対1。 */
const CHAT_IMAGE_EXTENSIONS = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
} as const satisfies Record<PromptImageMediaType, string>

/**
 * 雑談の画像1枚を `<root>/<パック名>/images/<YYYY-MM-DD>-<id>.<拡張子>` に書く（`ChatArchive.writeImage` の実装）。
 * 日付は `at` のローカル日付で、期限切れの掃除は名前の先頭の日付だけを見る。
 * id・data URL のどちらかが通らないときはパスを組み立てずに失敗を返す。
 * 同じ名前のファイルがあれば上書きせずに失敗にする。
 */
export async function writeChatImage(
  root: string,
  packName: CharacterPackName,
  image: ChatArchiveImage,
): Promise<ChatArchiveImageWriteResult> {
  const source = parsePromptImage(image.dataUrl)
  if (!promptImageIdSchema.safeParse(image.id).success || source === undefined) {
    return { kind: "failed", error: undefined }
  }
  const fileName = `${localDateKey(image.at)}-${image.id}.${CHAT_IMAGE_EXTENSIONS[source.mediaType]}`
  const dir = join(root, packName, CHAT_IMAGE_DIR_NAME)
  try {
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, fileName), Buffer.from(source.base64, "base64"), { flag: "wx" })
    return { kind: "written", fileName }
  } catch (error) {
    return { kind: "failed", error }
  }
}
