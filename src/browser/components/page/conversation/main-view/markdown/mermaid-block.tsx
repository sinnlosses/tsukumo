// レポートの ```mermaid フェンスの中身を図として描く。**mermaid は tsukumo 自身のサーバから
// 配り、その記法が実際に出てきたときだけ `<script>` で読み込む**（`docs/display.md` 4.2）。
//
// もとは別ファイルの処理だったものを、部品の `useEffect` に持ち替えた（移行の段6。
// docs/design.md 6.4）。
//
// **1つのレポートに複数の図があっても、描くのは1つずつ**（`drawing` の鎖）。mermaid はモジュール
// 全体で1つの状態を持つので、同時に走らせると中身の無い SVG ができる。
//
// **構文エラーのときはコードとエラー文を出す（mermaid のエラー図は出さない）**。
// `initialize({ suppressErrorRendering: true })` を立てると、mermaid は失敗時に
// 自分で `<pre class="mermaid">` の中へエラーの絵を描くかわりに `run()` の Promise を reject
// する（mermaid 11.15.0 と 12.0.0 の `dist/mermaid.min.js` で確認済み: このフラグが立っていると、
// 内部の描画関数はキャッチした例外をそのまま再送出する）。`mermaid.parse()` による事前判定は使わない
// — 読み込み自体の失敗（スクリプトが読めない）も含めて**1つの catch で受け止められる**ため
// （読み込み失敗は `vendor-script.ts` が `Error(src)` を投げるので、エラー文はその URL になる。
// まれにしか起きない経路なので、それ以上の作り込みはしない）。

import { useEffect, useRef, useState, type ReactElement } from "react"
import { isObjectType } from "remeda"

import { vendorAssetPath } from "../../../../../../shared/vendor-asset.ts"
import styles from "./report-notation.module.css"
import { loadVendorScript } from "./vendor-script.ts"

const MERMAID_SRC = vendorAssetPath("mermaid.min.js")

/**
 * まだ描き終わっていない図の鎖。**`mermaid.run()` を同時に走らせると、一部の図が中身の無い
 * SVG になる**（11.15.0 で実測。1つのレポートに図を8つ置くと、毎回2〜3つが空で
 * 描かれ、落ちるものは実行のたびに変わった）。mermaid はモジュール全体で1つの状態
 * （`initialize` の設定と、描画中に使う一時の DOM）を持つので、**ページ内の図は1つずつ順に描く**。
 * 図は多くても数個なので、直列にしても待ちは目に見えない。
 */
let drawing: Promise<unknown> = Promise.resolve()

export type MermaidBlockProps = {
  readonly code: string
}

export function MermaidBlock(props: MermaidBlockProps): ReactElement {
  const nodeRef = useRef<HTMLPreElement>(null)
  const [error, setError] = useState<string | undefined>(undefined)

  useEffect(() => {
    let cancelled = false

    drawInTurn(async () => {
      await loadVendorScript(MERMAID_SRC)
      const node = nodeRef.current
      if (cancelled || node === null) {
        return
      }
      mermaid.initialize({
        startOnLoad: false,
        theme: "dark",
        securityLevel: "strict",
        suppressErrorRendering: true,
      })
      await mermaid.run({ nodes: [node] })
    }).catch((reason: unknown) => {
      if (!cancelled) {
        setError(mermaidErrorText(reason))
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  if (error !== undefined) {
    return (
      <div className="mermaid-broken">
        <pre>
          <code>{props.code}</code>
        </pre>
        <p className={styles["mermaid-error"]}>{error}</p>
      </div>
    )
  }

  return (
    <pre ref={nodeRef} className="mermaid">
      {props.code}
    </pre>
  )
}

/**
 * 図を1つ、前の図が描き終わってから描く。**鎖は失敗で切らない**（1つの図の構文エラーで、
 * 同じレポートの後続の図まで描かれなくなるのを避ける）。呼び出し側へは元の Promise を返すので、
 * 失敗したその図だけがエラー表示に切り替わる。
 */
function drawInTurn(draw: () => Promise<void>): Promise<unknown> {
  const drawn = drawing.then(draw)
  drawing = drawn.catch(() => undefined)
  return drawn
}

/**
 * mermaid が投げる例外からエラー文を取り出す。mermaid 自身の `handleError` が
 * `"str" in error` で振り分けているのと同じ判定
 * （構文エラーは `.str` に人が読める文面を持つが `Error` のインスタンスとは限らない）。
 * どちらでもなければ `Error#message` を使い、それも無ければ文字列化する。
 */
function mermaidErrorText(reason: unknown): string {
  if (isObjectType(reason) && "str" in reason) {
    const { str } = reason
    if (typeof str === "string") {
      return str
    }
  }
  return reason instanceof Error ? reason.message : String(reason)
}
