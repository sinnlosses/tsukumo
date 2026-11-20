// 書いている途中の草稿で、次に届く見込みの部品の場所に置く骨組み。
// 紙に置くのは1か所だけ。読み上げには出さない（書いている途中であることは草稿の器が言う）。
// 骨組みの帯の右にはミニ立ち絵が立つ。骨組みが1か所なので、ミニ立ち絵も1体だけになる。

import clsx from "clsx"
import type { ReactElement } from "react"

import { Skeleton } from "../../../components/ui/skeleton/skeleton.tsx"
import { useSession } from "../../../stores/session.ts"
import { detailBlockClassName } from "../markdown.tsx"
import { RegionBox } from "./body-region.tsx"
import styles from "./leaf.module.css"

type PendingProps = {
  /** 明滅させるか。動きを減らす設定と演出の速さ「切る」では偽で、止めた薄い帯になる。 */
  readonly blink: boolean
}

/**
 * 塊1つぶんの骨組み（本文2行）と、その右に立つミニ立ち絵。
 * 骨組みは作り直さずに次の場所へ移り、ミニ立ち絵だけを次に届く部品（`next`）ごとに作り直して、届くたびに跳ねる出方を掛ける。
 */
export function PendingPart(props: PendingProps & { readonly next: string }): ReactElement {
  return (
    <div className={styles["pending-part"]} {...pendingMark("part", props.blink)}>
      <PendingLines />
      <PendingMini key={props.next} blink={props.blink} />
    </div>
  )
}

/** 節の見出しの骨組み。見出しと同じ要素に帯を入れ、届いた見出しと同じ高さとあきを取る。 */
export function PendingHeading(props: PendingProps): ReactElement {
  return (
    <h4 {...pendingMark("heading", props.blink)}>
      <Skeleton className={styles["pending-heading-bar"]}>{undefined}</Skeleton>
    </h4>
  )
}

/**
 * 根の `Report` がまだ届いていない書き始めの紙。結論と節1つぶんの骨組みを置く。
 * 次に届くのは根なので、明滅させるのは結論の側だけ。
 */
export function PendingPaper(props: {
  readonly blink: boolean
  /** 本文の根に重ねて付ける class（`Report` の `blockClassName` と同じ）。 */
  readonly blockClassName: string
}): ReactElement {
  return (
    <div className={clsx(detailBlockClassName, props.blockClassName)}>
      <RegionBox region={{ kind: "head" }}>
        <div
          className={clsx(styles["pending-part"], styles["pending-lead"])}
          {...pendingMark("part", props.blink)}
        >
          <PendingLines />
          <PendingMini blink={props.blink} />
        </div>
      </RegionBox>
      <RegionBox region={{ kind: "pending" }}>
        <PendingHeading blink={false} />
        <div className={styles["pending-part"]} {...pendingMark("part", false)}>
          <PendingLines />
        </div>
      </RegionBox>
    </div>
  )
}

/** 本文2行ぶんの帯の幅。2行目を短くして、段落の終わりの形にする。 */
const LINE_WIDTHS = ["100%", "64%"] as const

function PendingLines(): ReactElement {
  return (
    <div className={styles["pending-lines"]}>
      {LINE_WIDTHS.map((width) => (
        <Skeleton key={width} className={styles["pending-line"]} style={{ width }}>
          {undefined}
        </Skeleton>
      ))}
    </div>
  )
}

/** `character.json` に `miniCall` が無いパックで alt に使う呼び名（キャラクターの世界の言葉はパックが持つ）。 */
const MINI_CALL_FALLBACK = "ミニ立ち絵"

/**
 * 骨組みの右に立つミニ立ち絵。素材は `CharacterInfo.mini`（無いパックは `portraits.default` に落ちたものが届く）。
 * 明滅させるあいだだけ、出てくるときに小さく跳ね、そのあと揺れて書く仕草をする。止めた骨組みでは立っているだけ。
 */
function PendingMini(props: PendingProps): ReactElement {
  const character = useSession((session) => session.state.character)
  if (character?.mini === undefined) {
    return <></>
  }
  return (
    <div className={styles["pending-mini"]} {...(props.blink ? { "data-mini-motion": "" } : {})}>
      <img
        src={character.mini}
        alt={`${character.name}の${character.miniCall ?? MINI_CALL_FALLBACK}`}
        className={styles["pending-mini-body"]}
        draggable={false}
      />
    </div>
  )
}

/** 骨組みの要素が持つ印。`data-report-pending` は骨組みの種類で、置く側が届いた塊と見分ける。 */
function pendingMark(
  kind: "part" | "heading",
  blink: boolean,
): {
  readonly "aria-hidden": true
  readonly "data-report-pending": string
  readonly "data-pending-blink"?: string
} {
  return {
    "aria-hidden": true,
    "data-report-pending": kind,
    ...(blink ? { "data-pending-blink": "" } : {}),
  }
}
