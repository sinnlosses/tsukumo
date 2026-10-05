// 雑談中のサイドバーの3段目「覚えていること」。
// 中身は `persona.md` の `## 覚えたこと`（`SessionState.rememberedLines`）で、1行＝チップ1つ。
//
// チップは先頭を短く切って出し、押すとその場で全文に開く（もう一度押すと閉じる）。
// `title` の hover では出さない（キーボードでもタッチでも開けるように）。
//
// 「編集」は消せる行があるときだけ置く（空のときに押せても何もできない）。
// 押すと各チップに × が付く「編集の状態」になり、× を押すと消す前の確認を挟んでから `chat.forgetRememberedLine` を送る。
// 消し方はキャラクター自身の `forget` と同じ完全一致だが、1ターン1行の上限は掛からない（その上限はモデルの暴走を防ぐためのもので、画面から名指しした削除には要らない）。

import { useState, type ReactElement } from "react"

import { clipText } from "../../../../../shared/utils/clip-text.ts"
import { useSession } from "../../../../stores/session.ts"
import { Button } from "../../../ui/button/button.tsx"
import { Dialog } from "../../../ui/dialog/dialog.tsx"
import { HStack } from "../../../ui/h-stack/h-stack.tsx"
import { Text } from "../../../ui/text/text.tsx"
import sidebarStyles from "../sidebar.module.css"
import styles from "./persona-memory-section.module.css"
import { SidebarSection } from "./section.tsx"

/** チップに出す先頭の長さ（文字数）。超えた分は `…` に畳む。 */
const REMEMBERED_LINE_CHIP_LENGTH = 20

export function PersonaMemorySection(): ReactElement {
  const lines = useSession((session) => session.state.rememberedLines)
  const [editing, setEditing] = useState(false)
  // 押して開いた1行。文面そのもので指す（同じ文面が2行あっても、どちらを開いても見え方は同じなので困らない）。
  const [openLine, setOpenLine] = useState<string | undefined>(undefined)
  const [confirmLine, setConfirmLine] = useState<string | undefined>(undefined)

  return (
    <SidebarSection
      title="覚えていること"
      extraClass={sidebarStyles["sidebar-block-chat"]}
      action={
        lines.length === 0
          ? undefined
          : {
              label: editing ? "完了" : "編集",
              onAction: () => {
                setEditing((current) => !current)
                setOpenLine(undefined)
              },
            }
      }
      filters={undefined}
    >
      {lines.length === 0 ? (
        <Text element="p" size="inherit" tone="ink-quiet" weight="inherit" className="">
          まだ覚えていることが無い
        </Text>
      ) : (
        <ul className={styles["sidebar-persona-memory-list"]} aria-label="覚えていること">
          {lines.map((line, index) => (
            // 並びは届くたびに丸ごと置き換わり、同じ文面が2行あることもあるので位置で引く。
            <li key={index} className={styles["sidebar-persona-memory-item"]}>
              <button
                type="button"
                className={styles["sidebar-persona-memory-chip"]}
                aria-expanded={openLine === line}
                onClick={() => {
                  setOpenLine((current) => (current === line ? undefined : line))
                }}
              >
                {openLine === line ? line : truncatedRememberedLine(line)}
              </button>
              {editing && (
                <Button
                  variant="ghost"
                  size="action"
                  pressed="none"
                  disabled={false}
                  ariaLabel={`「${line}」を消す`}
                  disclosure={{ kind: "none" }}
                  ariaHasPopup={undefined}
                  title={undefined}
                  className={styles["sidebar-persona-memory-remove"]}
                  onClick={() => {
                    setConfirmLine(line)
                  }}
                >
                  ×
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {confirmLine !== undefined && (
        <PersonaMemoryForgetConfirm
          line={confirmLine}
          onClose={() => {
            setConfirmLine(undefined)
          }}
        />
      )}
    </SidebarSection>
  )
}

/** 先頭を切ってチップに出す形（超えた分は `…`）。コードポイントで数える（サロゲートペアを割らない）。 */
function truncatedRememberedLine(line: string): string {
  const { head, omittedLength } = clipText(line, REMEMBERED_LINE_CHIP_LENGTH)
  return omittedLength > 0 ? `${head}…` : head
}

type PersonaMemoryForgetConfirmProps = {
  readonly line: string
  /** OK・キャンセル・Esc で閉じたあとのいずれでも呼ばれる。 */
  readonly onClose: () => void
}

/**
 * 「この1行を消しますか」の確認。消した行は戻せないので挟む。
 * OK を押したら即座に閉じ、サーバの結果は待たない。
 * 押している間にキャラクター自身の `forget` / `remember` で一覧が変わっていても、`chat.forgetRememberedLine` は完全一致でしか消さないので、二重に消しても・行がもう無くても壊れない。
 * 一覧は次に届く `remembered-lines-changed` で最新になる。
 */
function PersonaMemoryForgetConfirm(props: PersonaMemoryForgetConfirmProps): ReactElement {
  const dispatch = useSession((session) => session.dispatch)

  const forget = (): void => {
    dispatch.chat.forgetRememberedLine({ line: props.line })
    props.onClose()
  }

  return (
    <Dialog
      open={true}
      ariaLabel="覚えたことを消す"
      backdrop="dim"
      placement={{ kind: "auto" }}
      onClose={props.onClose}
      className={styles["sidebar-persona-memory-confirm"]}
    >
      <Text
        element="p"
        size="heading"
        tone="inherit"
        weight="semibold"
        className={styles["sidebar-persona-memory-confirm-question"]}
      >
        「{props.line}」を消しますか
      </Text>
      <Text
        element="p"
        size="inherit"
        tone="ink-quiet"
        weight="inherit"
        className={styles["sidebar-persona-memory-confirm-note"]}
      >
        消すと元に戻せない。
      </Text>
      <HStack
        element="div"
        name={{ kind: "none" }}
        ref={undefined}
        gap="sm"
        align="stretch"
        justify="end"
        wrap="nowrap"
        className={styles["sidebar-persona-memory-confirm-actions"]}
      >
        <Button
          variant="outline"
          size="secondary"
          pressed="none"
          disabled={false}
          ariaLabel={undefined}
          disclosure={{ kind: "none" }}
          ariaHasPopup={undefined}
          title={undefined}
          className={styles["sidebar-persona-memory-confirm-cancel"]}
          onClick={props.onClose}
        >
          キャンセル
        </Button>
        <Button
          variant="outline-warn"
          size="secondary"
          pressed="none"
          disabled={false}
          ariaLabel={undefined}
          disclosure={{ kind: "none" }}
          ariaHasPopup={undefined}
          title={undefined}
          className={styles["sidebar-persona-memory-confirm-ok"]}
          onClick={forget}
        >
          消す
        </Button>
      </HStack>
    </Dialog>
  )
}
