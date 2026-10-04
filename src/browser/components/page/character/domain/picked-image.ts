// 選ばれた・落とされた画像のファイルを data URL にして、書き込む口へ渡す。

import { readDataUrl } from "../../../../utils/data-url.ts"

/**
 * 選ばれた画像を data URL にして `send` へ渡す。同じファイルをもう一度選べるように `value` を
 * 戻す（戻さないと `change` が起きない）。読めなかった回は何も送らない。
 */
export async function readPicked(
  input: HTMLInputElement,
  send: (image: string) => void,
): Promise<void> {
  const file = input.files?.[0]
  input.value = ""
  if (file === undefined) {
    return
  }

  await readFile(file, send)
}

/** 1つのファイルを data URL にして `send` へ渡す（中身の検証はサーバ側）。 */
export async function readFile(file: File, send: (image: string) => void): Promise<void> {
  const image = await readDataUrl(file)
  if (image !== undefined) {
    send(image)
  }
}
