// 外部ライブラリが、ブラウザのグローバルに置くものの型。
//
// パッケージは npm にあるが、束ねずに素の JavaScript を `<script>` で読む（`readVendorAsset`）ので、そこから型は付いてこない。
// ここに使っている分だけを手で書く。使っていない API を足さない（書いた分が「使ってよい」の線になる）。

declare global {
  /**
   * mermaid（`/vendor/mermaid.min.js` から読む）。
   * `MermaidBlock` が図の記法を見つけたときだけ動的に読み込むので、参照する時点（読み込みの `then` の中）では必ず存在する。
   */
  const mermaid: {
    readonly initialize: (options: {
      readonly startOnLoad: boolean
      readonly theme: string
      /** 図の配置の計算。mermaid 12.1.0 の既定は `elk`。 */
      readonly layout: "dagre" | "elk"
      /** `theme: "base"` のときだけ効く。値は hex のみ（CSS 変数・色名は受け取らない）。 */
      readonly themeVariables: Readonly<Record<string, string | boolean>>
      readonly securityLevel: string
      /**
       * 失敗したときに mermaid 自身がエラーの絵を `<pre class="mermaid">` の中へ描くのを止める。
       * `true` だと `render()` は絵を描くかわりに Promise を reject する。
       */
      readonly suppressErrorRendering: boolean
    }) => void
    /** `id` は SVG の `id` と中の `<style>` の接頭辞になる。 */
    readonly render: (
      id: string,
      code: string,
    ) => Promise<{
      readonly svg: string
      readonly bindFunctions: ((element: Element) => void) | undefined
    }>
  }

  /**
   * Chart.js（`/vendor/chart.umd.min.js` から読む）。mermaid と同じく、必要になったときだけ読み込む。
   * `defaults` は、明るい背景向けの既定値（文字も目盛り線も黒寄り）を暗い配色へ寄せるのと、`.chart-block` の
   * 高さへ収めるために触る（`loadChart`）。
   * `borderColor` は書かない。4.5.0 から、そこが既定から動いていると内蔵の colors プラグインが系列に色を配らなくなるので、線の色は `scale` の側へ書く。
   */
  const Chart: (new (
    target: Element,
    config: unknown,
  ) => {
    /**
     * 描いたものを捨てて `<canvas>` を明け渡す。
     * 同じ `<canvas>` に描き直す前に必ず呼ぶ（Chart.js は使用中の canvas に二度目を描こうとすると例外を投げる）。
     */
    readonly destroy: () => void
  }) & {
    readonly defaults: {
      color: string
      maintainAspectRatio: boolean
      readonly font: { readonly family: string }
      readonly scale: {
        readonly grid: { color: string; display: boolean }
        readonly border: { color: string }
      }
      readonly plugins: {
        readonly colors: { enabled: boolean }
        readonly legend: { display: boolean }
      }
    }
    /**
     * `beforeUpdate` の `chart.config` は、`new Chart` に渡した config そのもの。
     */
    readonly register: (plugin: {
      readonly id: string
      readonly beforeLayout?: (chart: ChartInstance) => void
      readonly afterDatasetsDraw?: (chart: ChartInstance) => void
      readonly beforeUpdate?: (chart: {
        readonly config: {
          readonly type?: string
          readonly data?: {
            readonly datasets?: {
              type?: string
              data?: readonly unknown[]
              backgroundColor?: unknown
              borderColor?: unknown
            }[]
          }
        }
      }) => void
    }) => void
  }

  /** プラグインの描画フックが受け取る `chart` のうち、読む分。 */
  type ChartInstance = {
    readonly ctx: CanvasRenderingContext2D
    readonly canvas: HTMLCanvasElement
    /** 描く領域（余白の内側）の左端の座標と、canvas 全体の幅。 */
    readonly chartArea: { readonly left: number }
    readonly width: number
    readonly config: { readonly type: string }
    readonly data: {
      readonly labels: readonly string[]
      readonly datasets: readonly {
        readonly label: string
        readonly data: readonly unknown[]
        readonly backgroundColor: unknown
      }[]
    }
    readonly options: {
      readonly indexAxis: string
      readonly plugins: Readonly<Record<string, unknown>>
      readonly layout: {
        padding: {
          readonly left: number
          readonly right: number
          readonly top: number
          readonly bottom: number
        }
      }
    }
    readonly scales: Readonly<
      Record<string, { readonly getPixelForValue: (value: number) => number }>
    >
    readonly isDatasetVisible: (index: number) => boolean
    /** 棒・点は `x` `y`（値側の端の座標）、扇は `x` `y` が中心で `startAngle` `endAngle` `outerRadius` を持つ。`height` は横棒の太さで、棒以外では読まない。 */
    readonly getDatasetMeta: (index: number) => {
      readonly data: readonly {
        readonly x: number
        readonly y: number
        readonly height: number
        readonly startAngle: number
        readonly endAngle: number
        readonly outerRadius: number
      }[]
    }
  }
}

// このファイルをモジュールにして declare global を効かせるのに要る
// oxlint-disable-next-line unicorn/require-module-specifiers
export {}
