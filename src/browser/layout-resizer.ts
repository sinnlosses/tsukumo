// 3本の仕切り（上段の縦・下段の縦・上下の横）をドラッグで動かす配線と、既定に戻すボタン。
//
// **論点（列の定義の持ち替え）**: 上段（メイン・サイドバー）と下段（キャラビュー・入力欄）で
// 縦の仕切り位置が違うため、4列共有の `grid-template-columns` では3本の仕切りを独立に動かせない
// （`docs/requirements.md` 4.7）。上下の行それぞれを別の grid（`.layout-row-top` /
// `.layout-row-bottom`）にし、列幅・行の高さを CSS カスタムプロパティで持つ（`--layout-top-left`
// 等）。既定値は `src/view.ts` の STYLE 側の `var()` フォールバックにも重複して書いてあり、
// 下の `DEFAULTS` と一致させる必要がある。ドラッグはこの変数を書き換えるだけで、実際の列・行の
// サイズ計算は CSS の grid に任せる。
//
// **要素が見つからない（このページの HTML と一緒に配られていない）ときは何もしない。**
// 描画ループの try/catch を散らすのではなく、`wireLayoutResizer` の1箇所で弾く
// （`docs/coding-standards.md`「エラーハンドリング」と同じ、受け止める場所を1つにする考え方）。

const STORAGE_KEY = "tsukumo-layout-split"
// **STYLE の grid-template-rows / grid-template-columns の var() 第2引数（フォールバック値）と
// 一致させること**（JS が動かない場合の見た目もこの値になる）。下段の左右は半々（ユーザーの指定）。
const DEFAULTS = { rowTop: 60, topLeft: 75, bottomLeft: 50 } as const
// 仕切りをどちらかの端まで詰めて操作不能にしないための可動域。
const MIN_PERCENT = 15
const MAX_PERCENT = 85

type Split = { readonly rowTop: number; readonly topLeft: number; readonly bottomLeft: number }

export type LayoutResizerElements = {
  readonly grid: HTMLElement
  readonly rowTop: HTMLElement
  readonly rowBottom: HTMLElement
  readonly resizerRow: HTMLElement
  readonly resizerTop: HTMLElement
  readonly resizerBottom: HTMLElement
  readonly resetButton: HTMLElement
}

/**
 * `document` から要素を探して {@link bindLayoutResizer} を呼ぶ。**ページに1回だけ呼ぶ**
 * （呼ぶのは入口の `src/browser/main.ts`）。要素が1つでも見つからなければ何もしない。
 */
export function wireLayoutResizer(): void {
  const grid = document.querySelector<HTMLElement>(".layout-grid")
  const rowTop = grid?.querySelector<HTMLElement>(".layout-row-top")
  const rowBottom = grid?.querySelector<HTMLElement>(".layout-row-bottom")
  const resizerRow = grid?.querySelector<HTMLElement>(".layout-resizer-horizontal")
  const resizerTop = rowTop?.querySelector<HTMLElement>(".layout-resizer-vertical")
  const resizerBottom = rowBottom?.querySelector<HTMLElement>(".layout-resizer-vertical")
  const resetButton = document.querySelector<HTMLElement>(".layout-reset")

  if (
    grid === null ||
    grid === undefined ||
    rowTop === null ||
    rowTop === undefined ||
    rowBottom === null ||
    rowBottom === undefined ||
    resizerRow === null ||
    resizerRow === undefined ||
    resizerTop === null ||
    resizerTop === undefined ||
    resizerBottom === null ||
    resizerBottom === undefined ||
    resetButton === null
  ) {
    return
  }

  bindLayoutResizer({ grid, rowTop, rowBottom, resizerRow, resizerTop, resizerBottom, resetButton })
}

/**
 * 3本の仕切りのドラッグと既定に戻すボタンを配線する。**新しい依存は足さず、素の `pointerdown` /
 * `pointermove` / `pointerup` で書く。** `localStorage` はブラウザのグローバルをそのまま使う
 * （読み書きに失敗しても既定へ落ちるだけで、この関数自体は例外を投げない）。
 */
export function bindLayoutResizer(elements: LayoutResizerElements): void {
  const { grid, rowTop, rowBottom, resizerRow, resizerTop, resizerBottom, resetButton } = elements

  let split = loadSplit()

  function applySplit(): void {
    grid.style.setProperty("--layout-row-top", `${String(split.rowTop)}fr`)
    grid.style.setProperty("--layout-row-bottom", `${String(100 - split.rowTop)}fr`)
    rowTop.style.setProperty("--layout-top-left", `${String(split.topLeft)}fr`)
    rowTop.style.setProperty("--layout-top-right", `${String(100 - split.topLeft)}fr`)
    rowBottom.style.setProperty("--layout-bottom-left", `${String(split.bottomLeft)}fr`)
    rowBottom.style.setProperty("--layout-bottom-right", `${String(100 - split.bottomLeft)}fr`)
  }

  applySplit()

  function bindOne(
    resizer: HTMLElement,
    container: HTMLElement,
    orientation: "horizontal" | "vertical",
    setPercent: (percent: number) => void,
  ): void {
    resizer.addEventListener("pointerdown", (event) => {
      if (typeof resizer.setPointerCapture === "function") {
        resizer.setPointerCapture(event.pointerId)
      }
      const rect = container.getBoundingClientRect()

      function onMove(moveEvent: PointerEvent): void {
        const raw =
          orientation === "horizontal"
            ? ((moveEvent.clientY - rect.top) / rect.height) * 100
            : ((moveEvent.clientX - rect.left) / rect.width) * 100
        setPercent(clampPercent(raw))
        applySplit()
      }
      function onUp(): void {
        resizer.removeEventListener("pointermove", onMove)
        resizer.removeEventListener("pointerup", onUp)
        saveSplit(split)
      }
      resizer.addEventListener("pointermove", onMove)
      resizer.addEventListener("pointerup", onUp)
    })
  }

  bindOne(resizerRow, grid, "horizontal", (percent) => {
    split = { ...split, rowTop: percent }
  })
  bindOne(resizerTop, rowTop, "vertical", (percent) => {
    split = { ...split, topLeft: percent }
  })
  bindOne(resizerBottom, rowBottom, "vertical", (percent) => {
    split = { ...split, bottomLeft: percent }
  })

  resetButton.addEventListener("click", () => {
    split = DEFAULTS
    applySplit()
    saveSplit(split)
  })
}

function clampPercent(value: number): number {
  return Math.min(MAX_PERCENT, Math.max(MIN_PERCENT, value))
}

function isValidPercent(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= MIN_PERCENT &&
    value <= MAX_PERCENT
  )
}

function loadSplit(): Split {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    return DEFAULTS
  }
  if (raw === null) {
    return DEFAULTS
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed !== null && typeof parsed === "object") {
      const rowTop = (parsed as Record<string, unknown>)["rowTop"]
      const topLeft = (parsed as Record<string, unknown>)["topLeft"]
      const bottomLeft = (parsed as Record<string, unknown>)["bottomLeft"]
      if (isValidPercent(rowTop) && isValidPercent(topLeft) && isValidPercent(bottomLeft)) {
        return { rowTop, topLeft, bottomLeft }
      }
    }
  } catch {
    // 保存値が JSON として壊れている。既定に落ちる。
  }
  return DEFAULTS
}

function saveSplit(value: Split): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {
    // プライベートウィンドウなどで書けないだけなので、保存できないまま続ける。
  }
}
