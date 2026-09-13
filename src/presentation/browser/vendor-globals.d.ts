// `vendor/` に同梱した外部ライブラリが、ブラウザのグローバルに置くものの型。
//
// **ライブラリ本体は npm から入れていない**（`vendor/README.md`。CDN も使わず、自分のサーバから
// 配る）ので、型定義も付いてこない。ここに**使っている分だけ**を手で書く。使っていない API を
// 足さない（書いた分が「使ってよい」の線になる）。

declare global {
  interface Window {
    /** Idiomorph 0.8.0（`vendor/idiomorph.min.js`）。DOM を捨てずに差分だけ当てる。 */
    readonly Idiomorph: {
      /**
       * `target` の中身を `html` に合わせる。`morphStyle: "innerHTML"` は中身だけを対象にし、
       * `target` 自身は残す。
       */
      readonly morph: (
        target: Element,
        html: string,
        options: { readonly morphStyle: "innerHTML" | "outerHTML" },
      ) => void
    }
  }

  /**
   * highlight.js。ページの `<head>` で読み込み済み（`report-renderers.ts` はここでは読み込まない）。
   * 読み込みに失敗すると存在しないので `| undefined`。
   */
  const hljs: { readonly highlightElement: (element: Element) => void } | undefined

  /**
   * mermaid（`vendor/mermaid.min.js`）。**`report-renderers.ts` が図の記法を見つけたときだけ**
   * 動的に読み込むので、参照する時点（読み込みの `then` の中）では必ず存在する。
   */
  const mermaid: {
    readonly initialize: (options: {
      readonly startOnLoad: boolean
      readonly theme: string
      readonly securityLevel: string
    }) => void
    readonly run: (options: { readonly nodes: readonly Element[] }) => Promise<void>
  }

  /**
   * Chart.js（`vendor/chart.umd.min.js`）。mermaid と同じく、必要になったときだけ読み込む。
   * `defaults` は**明るい背景向けの既定値**（文字 `#666`・目盛り線 `rgba(0,0,0,0.1)`）を
   * 暗い配色へ寄せるためだけに触る（`report-renderers.ts`）。
   */
  const Chart: (new (target: Element, config: unknown) => unknown) & {
    readonly defaults: { color: string; borderColor: string }
  }
}

export {}
