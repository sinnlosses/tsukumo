// 入力欄のサーフェス（`<textarea>` とマークダウンエディタ）と、サーフェスが映す下書き・サーフェスから届くキーの形。
// どちらの面も DOM の型をここへ持ち込まない。

import type { ComposerSurface, Draft } from "../../../stores/composer-draft.ts"

export type { ComposerSurface }

/** キーの読み替えに使う値。React の合成イベントとエディタの素の `KeyboardEvent` のどちらからも作る。 */
export type ComposerKey = {
  readonly key: string
  readonly ctrlKey: boolean
  readonly metaKey: boolean
  readonly shiftKey: boolean
  readonly keyCode: number
  readonly isComposing: boolean
  readonly preventDefault: () => void
}

/** 面が受けて入力欄のロジックへ渡す呼び先。画像の3つは画像のときだけ `preventDefault` する。 */
export type ComposerSurfaceHandlers = {
  readonly onChange: (draft: Draft) => void
  /** 処理した（面の既定の振る舞いへ流さない）なら true。 */
  readonly onKeyDown: (key: ComposerKey) => boolean
  readonly onPaste: (event: Pick<ClipboardEvent, "clipboardData" | "preventDefault">) => void
  readonly onDragOver: (event: Pick<DragEvent, "dataTransfer" | "preventDefault">) => void
  readonly onDrop: (event: Pick<DragEvent, "dataTransfer" | "preventDefault">) => void
}
