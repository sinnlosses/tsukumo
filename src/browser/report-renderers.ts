// レポートの中の**コード・図・グラフ**を描く。**同梱したライブラリ**（`vendor/README.md`）を
// `127.0.0.1` から読むので、表示のたびに外部へ通信は飛ばない（2026-09-10 のユーザーの決定）。
//
// - コードの色付け（highlight.js）はページの `<head>` で読み込み済みのものを使う
// - **mermaid と Chart.js は、その記法が実際に出てきたときだけ読み込む。** レポートが図を
//   書かない限り、重いファイルは1バイトも読まれない
// - 描き終えたものには印を付け、push で本文が差し替わったときだけ描き直す

const DATA_MERMAID_SRC = "data-mermaid-src"
const DATA_CHART_SRC = "data-chart-src"

/**
 * `document` から `.layout-main` と、そこに乗る同梱ライブラリの経路（`data-mermaid-src` /
 * `data-chart-src`。{@link DATA_MERMAID_SRC} / {@link DATA_CHART_SRC}）を読んで
 * {@link startReportRenderers} を呼ぶ。見つからなければ何もしない。
 */
export function wireReportRenderers(): void {
  const element = document.querySelector(".layout-main")
  if (element === null) {
    return
  }
  const mermaidSrc = element.getAttribute(DATA_MERMAID_SRC)
  const chartSrc = element.getAttribute(DATA_CHART_SRC)
  if (mermaidSrc === null || chartSrc === null) {
    return
  }
  startReportRenderers(element, mermaidSrc, chartSrc)
}

/**
 * `element`（メインビューの領域）の中身が変わるたびに、コードの色付け・mermaid の図・
 * Chart.js のグラフを描く。`mermaidSrc` / `chartSrc` は同梱ライブラリを配る経路
 * （`src/view.ts` の `vendorPath`）。
 */
export function startReportRenderers(element: Element, mermaidSrc: string, chartSrc: string): void {
  const loaded = new Map<string, Promise<void>>()
  const loadOnce = (src: string): Promise<void> => {
    const already = loaded.get(src)
    if (already !== undefined) {
      return already
    }
    const loading = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script")
      script.src = src
      script.addEventListener("load", () => {
        resolve()
      })
      script.addEventListener("error", () => {
        reject(new Error(src))
      })
      document.head.appendChild(script)
    })
    loaded.set(src, loading)
    return loading
  }

  const highlight = (): void => {
    if (hljs === undefined) {
      return
    }
    for (const block of element.querySelectorAll<HTMLElement>("pre code:not([data-highlighted])")) {
      block.dataset.highlighted = "yes"
      hljs.highlightElement(block)
    }
  }

  const drawDiagrams = (): void => {
    const nodes = [...element.querySelectorAll<HTMLElement>("pre.mermaid:not([data-drawn])")]
    if (nodes.length === 0) {
      return
    }
    for (const node of nodes) {
      node.dataset.drawn = "yes"
    }
    loadOnce(mermaidSrc)
      .then(() => {
        mermaid.initialize({ startOnLoad: false, theme: "dark", securityLevel: "strict" })
        return mermaid.run({ nodes })
      })
      .catch(() => {
        for (const node of nodes) {
          node.dataset.drawn = "failed"
        }
      })
  }

  const drawCharts = (): void => {
    const canvases = [
      ...element.querySelectorAll<HTMLElement>("canvas[data-chart]:not([data-drawn])"),
    ]
    if (canvases.length === 0) {
      return
    }
    for (const canvas of canvases) {
      canvas.dataset.drawn = "yes"
    }
    loadOnce(chartSrc)
      .then(() => {
        for (const canvas of canvases) {
          try {
            const raw = canvas.dataset.chart
            if (raw === undefined) {
              throw new Error("data-chart が無い")
            }
            // Chart は canvas 自身に居着く（戻り値を使わない）。ここでは JSON.parse の失敗も
            // まとめて catch で拾いたいので、あえて代入せず side effect のためだけに呼ぶ。
            void new Chart(canvas, JSON.parse(raw))
          } catch {
            canvas.dataset.drawn = "failed"
          }
        }
      })
      .catch(() => {})
  }

  const draw = (): void => {
    highlight()
    drawDiagrams()
    drawCharts()
  }

  new MutationObserver(draw).observe(element, { childList: true })
  draw()
}
