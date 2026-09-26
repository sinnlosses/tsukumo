// 表情を消す前の確かめ（「消す」アイコンを押した直後だけ組み立てる。`portrait-card.tsx` の
// 「開いているか」を受けて、押したカードに添う小さな吹き出しとして出す。
// docs/screen-design.md 13.6「表情を消す前の確かめ」）。
//
// 画面全体は覆わない——`task-run-confirm.tsx` / `image-zoom.tsx` の中央寄せの確認とは違い、
// `<dialog>` の UA 既定の中央寄せ（`inset: 0; margin: auto;`）を外し、押した口の位置（`anchor`。
// `getBoundingClientRect()` を押した瞬間の1回だけ測ったもの）から自分で置き場所を決める。
// `showModal()` で top layer に出す点は同じなので、`.character-card` の `overflow: hidden` には
// 切り取られない。`::backdrop` は透明にして、画面を暗く覆わずに「外側クリックで閉じる」の
// 読み替えだけ borrow する（`task-run-confirm.tsx` と同じ `event.target === dialogRef.current`）。

import { type ReactElement } from "react"

import { Button } from "../../../../../../ui/button/button.tsx"
import { Dialog, type DialogPlacement } from "../../../../../../ui/dialog/dialog.tsx"
import { HStack } from "../../../../../../ui/h-stack/h-stack.tsx"
import { Text } from "../../../../../../ui/text/text.tsx"
import styles from "../../../../character.module.css"

/** 吹き出しの幅（見本の実測。`docs/screen-design.md` 13.6「表情を消す前の確かめ」）。 */
const CONFIRM_WIDTH = 300
/** ビューポートの端から確保する余白。右端の列・下端に近いカードでも横スクロールを出さない。 */
const VIEWPORT_MARGIN = 16
/** 吹き出しの高さの見積もり（下に置くか上に置くかを決めるためだけの値。実寸は内容で決まる）。 */
const ESTIMATED_HEIGHT = 190

export type PortraitClearConfirmProps = {
  /** 押した「消す」アイコンを含むカードの位置（開いた瞬間の1回だけ測ったもの）。 */
  readonly anchor: DOMRect
  /** 消そうとしている表情のラベル。 */
  readonly label: string
  /** 消したあとに代わりに出る表情（`default`）のラベル。 */
  readonly fallbackLabel: string
  readonly portraitUrl: string
  /** 確かめの「消す」を押したとき。 */
  readonly onConfirm: () => void
  /** 「やめる」・Esc・外側のクリックのいずれでも呼ばれる（開いているかは呼び出し側が持つ）。 */
  readonly onClose: () => void
}

/** 開いた状態で組み立てられる部品。閉じるときは呼び出し側がこの部品ごと外す
 * （`task-run-confirm.tsx` と同じ形）。 */
export function PortraitClearConfirm(props: PortraitClearConfirmProps): ReactElement {
  return (
    <Dialog
      open={true}
      name={{ kind: "label", label: "表情を消す" }}
      backdrop="clear"
      placement={anchoredPlacement(props.anchor)}
      onClose={props.onClose}
      className={styles["character-clear-confirm"] ?? ""}
    >
      <HStack
        element="div"
        name={{ kind: "none" }}
        ref={undefined}
        gap="md"
        align="center"
        justify="start"
        wrap="nowrap"
        className=""
      >
        <img
          className={styles["character-clear-confirm-portrait"]}
          src={props.portraitUrl}
          alt=""
        />
        <Text element="span" size="secondary" tone="inherit" weight="bold" className="">
          「{props.label}」を消しますか？
        </Text>
      </HStack>
      <Text
        element="p"
        size="action"
        tone="ink-quiet"
        weight="inherit"
        className={styles["character-clear-confirm-note"] ?? ""}
      >
        この表情を使う場面では「{props.fallbackLabel}」が出ます。
      </Text>
      <HStack
        element="div"
        name={{ kind: "none" }}
        ref={undefined}
        gap="sm"
        align="stretch"
        justify="end"
        wrap="nowrap"
        className=""
      >
        <Button
          type="button"
          variant="outline"
          size="secondary"
          pressed="none"
          disabled={false}
          ariaLabel={undefined}
          ariaHasPopup={undefined}
          title={undefined}
          className={styles["character-button-outline"] ?? ""}
          onClick={props.onClose}
        >
          やめる
        </Button>
        <Button
          type="button"
          variant="solid-danger"
          size="secondary"
          pressed="none"
          disabled={false}
          ariaLabel={undefined}
          ariaHasPopup={undefined}
          title={undefined}
          className={styles["character-clear-confirm-ok"] ?? ""}
          onClick={props.onConfirm}
        >
          <Text element="span" size="inherit" tone="inherit" weight="bold" className="">
            消す
          </Text>
        </Button>
      </HStack>
    </Dialog>
  )
}

/**
 * `anchor` から吹き出しの固定位置を計算する。カードの右下寄りに添わせつつ、ビューポートの外へ
 * はみ出さないよう左右・上下を詰める（`anchor` は `position: fixed` と同じ座標系。座標は
 * `<Dialog placement={{ kind: "at" }}>` が inline style へ置く）。
 */
function anchoredPlacement(anchor: DOMRect): DialogPlacement {
  const maxLeft = Math.max(window.innerWidth - CONFIRM_WIDTH - VIEWPORT_MARGIN, VIEWPORT_MARGIN)
  const left = Math.min(Math.max(anchor.left, VIEWPORT_MARGIN), maxLeft)

  const below = anchor.top + anchor.height * 0.55
  const fitsBelow = below + ESTIMATED_HEIGHT <= window.innerHeight - VIEWPORT_MARGIN
  const top = fitsBelow
    ? below
    : Math.max(VIEWPORT_MARGIN, anchor.top - ESTIMATED_HEIGHT + anchor.height * 0.45)

  return { kind: "at", top, left }
}
