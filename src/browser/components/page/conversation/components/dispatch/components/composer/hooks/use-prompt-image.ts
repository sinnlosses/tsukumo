// `<Composer>` に添える画像（`docs/requirements.md` 4.10）の持ち方と、貼り付け・ドロップ・
// ファイルを選ぶ窓からの取り込み。保つ（`images` の state）と外と同期（非同期の読み込み・
// ファイルを選ぶ `<input>` の入れ物）の2種類がそろうので、container と対になっていないフック
// として `use-composer.ts` から切り出した（docs/design.md 2章「機能の中を分ける」。読み込み
// そのもの（原寸と控えを作る・添えられる種類か見分ける）は `../prompt-image.ts` の純関数のまま
// 残し、ここは state とイベントの読み替えだけを持つ）。

import { useRef, useState, type ClipboardEvent, type DragEvent, type RefObject } from "react"

import {
  MAX_PROMPT_IMAGES,
  type PromptImage,
} from "../../../../../../../../../shared/prompt-image.ts"
import {
  carriesFiles,
  chosenPromptImageFiles,
  promptImageFiles,
  readPromptImage,
} from "../domain/prompt-image.ts"

export type UsePromptImageArgs = {
  /** 画像を選び終えたあと、入力欄へフォーカスを戻す（実体は呼び出し側の `textAreaRef`）。 */
  readonly focusTextArea: () => void
}

export type PromptImageModel = {
  /** 画像を選ぶ `<input type="file">` の入れ物（画面には出さず、ボタンから開く）。 */
  readonly imageInputRef: RefObject<HTMLInputElement | null>
  /** 添えた画像（送るまでの間だけ持つ）。 */
  readonly images: readonly PromptImage[]
  readonly onRemoveImage: (index: number) => void
  readonly onPaste: (event: Pick<ClipboardEvent, "clipboardData" | "preventDefault">) => void
  readonly onDragOver: (event: Pick<DragEvent, "dataTransfer" | "preventDefault">) => void
  readonly onDrop: (event: Pick<DragEvent, "dataTransfer" | "preventDefault">) => void
  /** 画像のボタン。ファイルを選ぶ窓を開く。 */
  readonly onPickImages: () => void
  /** ファイルを選ぶ窓で選び終えたとき。 */
  readonly onImagesChosen: (event: { readonly target: HTMLInputElement }) => void
  /** 送った・送信を諦めたときに呼ぶ（送った時点で原寸を手放す。札が消え、以降どこからも開けない）。 */
  readonly reset: () => void
}

export function usePromptImage(args: UsePromptImageArgs): PromptImageModel {
  const [images, setImages] = useState<readonly PromptImage[]>([])
  const imageInputRef = useRef<HTMLInputElement | null>(null)

  /**
   * 貼られた・落ちてきたファイルを札に足す。枚数の上限（{@link MAX_PROMPT_IMAGES}）で頭を
   * 打ち、読めなかった1枚は黙って落ちる（画面は1回の失敗で落ちない）。
   */
  const attachFiles = (files: readonly File[]): void => {
    void (async () => {
      const read = await Promise.all(files.slice(0, MAX_PROMPT_IMAGES).map(readPromptImage))
      const added = read.flatMap((image) => (image === undefined ? [] : [image]))
      if (added.length === 0) {
        return
      }
      setImages((current) => [...current, ...added].slice(0, MAX_PROMPT_IMAGES))
    })()
  }

  return {
    imageInputRef,
    images,
    onRemoveImage: (index) => {
      setImages((current) => current.filter((_, at) => at !== index))
    },
    onPaste: (event) => {
      const files = promptImageFiles(event.clipboardData)
      if (files.length === 0) {
        return
      }
      // 画像を貼ったときだけ既定の貼り付けを止める（文字の貼り付けはそのまま通す）。
      event.preventDefault()
      attachFiles(files)
    },
    onDragOver: (event) => {
      // ファイルを掴んできたときだけ落とせるようにする（文字のドラッグは `<textarea>` の
      // 既定の振る舞いのまま）。
      if (carriesFiles(event.dataTransfer)) {
        event.preventDefault()
      }
    },
    onDrop: (event) => {
      const files = promptImageFiles(event.dataTransfer)
      if (files.length === 0) {
        return
      }
      event.preventDefault()
      attachFiles(files)
    },
    onPickImages: () => {
      imageInputRef.current?.click()
    },
    onImagesChosen: (event) => {
      attachFiles(chosenPromptImageFiles(event.target.files))
      // 同じファイルを続けて選び直しても `change` が届くように、選んだものを空に戻す
      // （React の外にある入力の状態。札のほうは state が持っている）。
      event.target.value = ""
      args.focusTextArea()
    },
    reset: () => {
      setImages([])
    },
  }
}
