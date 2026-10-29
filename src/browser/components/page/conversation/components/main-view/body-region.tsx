// レポート本文の根と欄の入れ物と、欄の中の Markdown を塊に割って描く部品。
// 欄の中の書きかけの本文を空行で塊に割り、塊ごとに `memo`。描き直すのは変わった塊（たいてい末尾の1つ）だけで、確定済みの塊は Markdown の変換をやり直さない。
// 欄は別々に解析するので、閉じないタグはその欄の中で閉じ、次の欄の入れ物を巻き込まない。
//
// 書き上げていくように見せる演出（`useReportReveal`）は根に掛ける。
// 完成した DOM の根を渡すだけで、塊の中身には触らない。

import clsx from "clsx"
// oxlint-disable-next-line no-restricted-imports -- 描き直し回数を数える単体テストが Compiler の掛からない Vitest を通るため残す（docs/coding-standards/react.md「手でメモ化しない」）
import { memo, type ReactElement, type ReactNode } from "react"

import { isBlankText } from "../../../../../../shared/utils/blank-text.ts"
import { useReportReveal } from "../../../../../domain/reveal/use-report-reveal.ts"
import { Button } from "../../../../ui/button/button.tsx"
import { detailBlockClassName, Markdown } from "../markdown/markdown.tsx"
import { splitReportBlocks } from "./domain/block-split.ts"
import styles from "./main-view.module.css"

type ReportFrameProps = {
  /** 書き上げていくように見せるか。見るのはマウントした時点の値だけ。 */
  readonly reveal: boolean
  /** この本文が載っているやり取り（`MainViewTurn.id`）。配る筆先に添える。 */
  readonly turnId: number
  /** 置く側が足す class(狭い画面で隠すなど)。 */
  readonly className: string
  /** 欄の並び。マウントした時点で揃っている DOM に演出を掛ける。 */
  readonly children: ReactNode
}

/** 本文の根（`data-report-body`）と「全部出す」の口。 */
export function ReportFrame(props: ReportFrameProps): ReactElement {
  const rootRef = useReportReveal(props.reveal, props.turnId, () => {})

  return (
    <>
      {/* 飛ばす操作そのもの（押す・キー）は `useReportReveal` が窓で聞いているので、押された時点で残りは出ている。
          口は「飛ばせる」と知らせる顔で、演出中の表示は CSS が `data-revealing` を見て決める。 */}
      {props.reveal && (
        <Button
          variant="ghost"
          size="action"
          pressed="none"
          disabled={false}
          disclosure={{ kind: "none" }}
          className={styles["reveal-skip"]}
          onClick={() => undefined}
        >
          全部出す
        </Button>
      )}
      {/* `.detail-block` を2つ重ねる。
          見た目の本体は report-notation.module.css にあり、ステップの末尾の余白の打ち消し（`.main-step > .detail-block:last-child`）は main-view.module.css にある。
          CSS Modules は class 名をファイルごとにハッシュ化するので、片方だけでは打ち消しが当たらない。 */}
      <div
        className={clsx(detailBlockClassName, styles["detail-block"], props.className)}
        ref={rootRef}
        data-report-body=""
      >
        {props.children}
      </div>
    </>
  )
}

/** `report` ツールの外の本文（Markdown 1本）。空白だけなら欄を置かない。 */
export function MarkdownReport(
  props: Omit<ReportFrameProps, "children"> & { readonly markdown: string },
): ReactElement {
  return (
    <ReportFrame reveal={props.reveal} turnId={props.turnId} className={props.className}>
      {!isBlankText(props.markdown) && (
        <RegionBox region={{ kind: "markdown" }}>
          <RegionChunks markdown={props.markdown} />
        </RegionBox>
      )}
    </ReportFrame>
  )
}

/** 欄の入れ物が持つ印。 */
export type RegionMark =
  | { readonly kind: "head" | "retrospective" | "markdown" }
  | { readonly kind: "section"; readonly id: number }
  | { readonly kind: "favor"; readonly id: string }

/**
 * 欄1つの入れ物。`data-report-region` は欄の種類、節の欄は `data-report-section` に欄の ID を持つ（書き上げる演出が読む）。
 * お願いの欄は、合図の行の印が飛ぶ先の `id` を持つ。
 */
export function RegionBox(props: {
  readonly region: RegionMark
  readonly children: ReactNode
}): ReactElement {
  const { region } = props
  return (
    <div
      data-report-region={region.kind}
      data-report-section={region.kind === "section" ? String(region.id) : undefined}
      id={region.kind === "favor" ? region.id : undefined}
    >
      {props.children}
    </div>
  )
}

export function RegionChunks(props: { readonly markdown: string }): ReactElement {
  return (
    <>
      {keyedBlocks(splitReportBlocks(props.markdown)).map((block) => (
        <ReportBlock key={block.key} text={block.text} />
      ))}
    </>
  )
}

/** 同じ文字列の塊が欄に複数あっても `key` が重ならないよう、文字列に何個目かを添える。 */
function keyedBlocks(
  blocks: readonly string[],
): readonly { readonly key: string; readonly text: string }[] {
  return blocks.map((text, index) => ({
    key: `${blocks.slice(0, index).filter((earlier) => earlier === text).length}:${text}`,
    text,
  }))
}

/**
 * 塊1つぶんの Markdown。鍵（`key`）も props もその塊の文字列そのものなので、塊の内容が変わらない限り React はこの部品を再描画しない。
 *
 * `memo` を残す例外（docs/coding-standards.md「手でメモ化しない」）。
 * Compiler はクライアント環境にだけ掛かり、Vitest の実行（SSR 相当）には掛からない。
 * `memo` を外すと「変わらない塊は描き直さない」がテストで確かめられなくなる。
 */
const ReportBlock = memo(ReportBlockView)

function ReportBlockView(props: { readonly text: string }): ReactElement {
  return <Markdown text={props.text} />
}
