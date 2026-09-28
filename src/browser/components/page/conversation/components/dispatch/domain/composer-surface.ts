// 入力欄の面（`<textarea>` とマークダウンエディタ）と、面が映す下書き・面から届くキーの形。
// どちらの面も DOM の型をここへ持ち込まない。

/** 打ちかけの文面と、その中のキャレットの位置。2つで1つの状態なので一緒に持つ。 */
export type Draft = {
  readonly text: string
  readonly caret: number
}

/** 下書きのほかに、入力欄のロジックが面に触るのはこの3つだけ。 */
export type ComposerSurface = {
  readonly focus: () => void
  /** いまの選択の位置。打たずにキャレットだけ動かしたぶんは下書きの `caret` に入っていないので、ここから読む。 */
  readonly caret: () => number
  readonly placeCaret: (caret: number) => void
}

/** キーの読み替えに使う値。React の合成イベントとエディタの素の `KeyboardEvent` のどちらからも作る。 */
export type ComposerKey = {
  readonly key: string
  readonly ctrlKey: boolean
  readonly metaKey: boolean
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
