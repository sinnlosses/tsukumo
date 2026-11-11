// レポート本文の根と欄の入れ物と、欄の中の Markdown を塊に割って描く部品。
// 欄の中の書きかけの本文を空行で塊に割り、塊ごとの部品にする。描き直すのは変わった塊（たいてい末尾の1つ）だけで、確定済みの塊は Markdown の変換をやり直さない。
// 欄は別々に解析するので、閉じないタグはその欄の中で閉じ、次の欄の入れ物を巻き込まない。
//
// 書き上げていくように見せる演出（`useReportReveal`）は根に掛け、節を書いている途中のレポートと同じポン（`draft-pop`）で出す。
// 完成した DOM の根を渡すだけで、塊の中身には触らない。

import clsx from "clsx"
import { createContext, type ReactElement, type ReactNode, use } from "react"

import { isBlankText } from "../../../../shared/utils/blank-text.ts"
import { useReportReveal } from "../../../domain/reveal/use-report-reveal.ts"
import { splitReportBlocks } from "../domain/block-split.ts"
import { detailBlockClassName, Markdown } from "../markdown.tsx"
import { ReplyPointScope } from "../reply-point.tsx"

type ReportFrameProps = {
  /** 書き上げていくように見せるか。見るのはマウントした時点の値だけ。 */
  readonly reveal: boolean
  /** この本文が載っているやり取り（`MainViewTurn.id`）。配る筆先に添える。 */
  readonly turnId: number
  /** 置く側が足す class(狭い画面で隠すなど)。 */
  readonly className: string
  /** 書き上げの演出が付けるポンの class。 */
  readonly revealClassName: string
  /** 本文の根に重ねて付ける class。 */
  readonly blockClassName: string
  /** 欄の並び。マウントした時点で揃っている DOM に演出を掛ける。 */
  readonly children: ReactNode
}

const RevealingContext = createContext(false)

/** 本文の根（`data-report-body`）。書き上げの演出の最中かと、指している単位を子へ配る。 */
export function ReportFrame(props: ReportFrameProps): ReactElement {
  const { rootRef, revealing } = useReportReveal(
    props.reveal,
    props.turnId,
    () => {},
    props.revealClassName,
  )

  return (
    // `.detail-block` を2つ重ねる。
    // 見た目の本体は report-notation.module.css にあり、ステップの末尾の余白の打ち消し（`.main-step > .detail-block:last-child`）は置く側の CSS にあり、その class 名を `blockClassName` で受ける。
    // CSS Modules は class 名をファイルごとにハッシュ化するので、片方だけでは打ち消しが当たらない。
    <div
      className={clsx(detailBlockClassName, props.blockClassName, props.className)}
      ref={rootRef}
      data-report-body=""
    >
      <RevealingContext value={revealing}>
        <ReplyPointScope rootRef={rootRef}>{props.children}</ReplyPointScope>
      </RevealingContext>
    </div>
  )
}

/** 包んでいる {@link ReportFrame} が書き上げの演出の最中か。外では偽。 */
export function useReportRevealing(): boolean {
  return use(RevealingContext)
}

/** `report` ツールの外の本文（Markdown 1本）。空白だけなら欄を置かない。 */
export function MarkdownReport(
  props: Omit<ReportFrameProps, "children"> & { readonly markdown: string },
): ReactElement {
  return (
    <ReportFrame
      reveal={props.reveal}
      turnId={props.turnId}
      className={props.className}
      revealClassName={props.revealClassName}
      blockClassName={props.blockClassName}
    >
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
  | {
      readonly kind: "section"
      readonly id: number
      readonly askCount: number
      readonly noteCount: number
    }
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
      data-ask-count={
        region.kind === "section" && region.askCount > 0 ? region.askCount : undefined
      }
      data-note-count={
        region.kind === "section" && region.noteCount > 0 ? region.noteCount : undefined
      }
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

/** 塊1つぶんの Markdown。鍵（`key`）も props もその塊の文字列そのものなので、塊の内容が変わらない限り Compiler は描き直さない。 */
function ReportBlock(props: { readonly text: string }): ReactElement {
  return <Markdown text={props.text} />
}
