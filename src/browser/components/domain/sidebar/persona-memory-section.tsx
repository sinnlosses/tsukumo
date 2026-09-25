// 雑談中のサイドバーの3段目「覚えていること」（docs/screen-design.md 13.7「雑談のときのサイドバー」）。
// 中身は `persona.md` の `## 覚えたこと`（`docs/glossary.md`「覚えたこと」・`SessionState.rememberedLines`）。
//
// **1行＝チップ1つ**（docs/design.md 7.1「1行だけ忘れる」）。チップは先頭を短く切って出し、
// **押すとその場で全文に開く**（もう一度押すと閉じる）。`title` の hover では出さない
// ——キーボードでもタッチでも開ける手を選んだ。
//
// **「編集」は消せる行があるときだけ置く**（区画の見出しの `action`。空のときに押せても
// 何もできない）。押すと各チップに × が付く「編集の状態」になり（一覧を別に開かない）、
// × を押すと消す前の確認（`PersonaMemoryForgetConfirm`）を挟んでから
// `forget-remembered-line` を送る。消し方はキャラクター自身の `forget` と同じ完全一致だが、
// **1ターン1行の上限は掛からない**（その上限はモデルの暴走を防ぐためのもので、画面から
// 名指しした削除には要らない）。

import { useState, type ReactElement } from "react"

import { Button } from "../../../components/ui/button/button.tsx"
import { Dialog } from "../../../components/ui/dialog/dialog.tsx"
import { HStack } from "../../../components/ui/h-stack/h-stack.tsx"
import { Text } from "../../../components/ui/text/text.tsx"
import { useSessionDispatch, useSessionSelector } from "../../../stores/session.tsx"
import { SidebarSection } from "./section.tsx"
import styles from "./sidebar.module.css"

/** チップに出す先頭の長さ（文字数）。超えた分は `…` に畳む。 */
const REMEMBERED_LINE_CHIP_LENGTH = 20

export function PersonaMemorySection(): ReactElement {
  const lines = useSessionSelector((session) => session.state.rememberedLines)
  const [editing, setEditing] = useState(false)
  // 押して開いた1行（文面そのもので指す。同じ文面が2行あっても、どちらを開いても見え方は
  // 同じなので困らない）。
  const [openLine, setOpenLine] = useState<string | undefined>(undefined)
  // 消す前の確認を出している1行（無ければ確認は閉じている）。
  const [confirmLine, setConfirmLine] = useState<string | undefined>(undefined)

  return (
    <SidebarSection
      title="覚えていること"
      extraClass={styles["sidebar-block-chat"] ?? ""}
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
    >
      {lines.length === 0 ? (
        <Text element="p" size="inherit" tone="ink-quiet" weight="inherit" className="">
          まだ覚えていることが無い
        </Text>
      ) : (
        <ul className={styles["sidebar-persona-memory-list"]} aria-label="覚えていること">
          {lines.map((line, index) => (
            // 並びは届くたびに丸ごと置き換わり、同じ文面が2行あることもあるので位置で引く
            // （`recent-topic-section.tsx` の話題の一覧と同じ考え方）。
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
                  type="button"
                  variant="ghost"
                  size="action"
                  pressed="none"
                  disabled={false}
                  ariaLabel={`「${line}」を消す`}
                  ariaHasPopup={undefined}
                  title={undefined}
                  className={styles["sidebar-persona-memory-remove"] ?? ""}
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
  const characters = [...line]
  return characters.length <= REMEMBERED_LINE_CHIP_LENGTH
    ? line
    : `${characters.slice(0, REMEMBERED_LINE_CHIP_LENGTH).join("")}…`
}

type PersonaMemoryForgetConfirmProps = {
  readonly line: string
  /** OK・キャンセル・Esc で閉じたあとのいずれでも呼ばれる。 */
  readonly onClose: () => void
}

/**
 * 「この1行を消しますか」の確認（`× を押したときだけ開く。docs/design.md 7.1「消す前の
 * 確認」——消した行は戻せない）。**OK を押したら即座に閉じる**（楽観的。サーバの結果は
 * 待たない）。もし押している間にキャラクター自身の `forget` / `remember` で一覧がすでに
 * 変わっていても、`forget-remembered-line` は完全一致でしか消さない安全な操作なので、
 * 二重に消しても・行がもう無くても壊れない（一致しなければ何もしないだけ）。一覧はどのみち
 * 次に届く `remembered-lines-changed` で必ず最新になる。
 */
function PersonaMemoryForgetConfirm(props: PersonaMemoryForgetConfirmProps): ReactElement {
  const dispatch = useSessionDispatch()

  const forget = (): void => {
    dispatch({ type: "forget-remembered-line", line: props.line })
    props.onClose()
  }

  return (
    <Dialog
      open={true}
      name={{ kind: "label", label: "覚えたことを消す" }}
      backdrop="dim"
      placement={{ kind: "auto" }}
      onClose={props.onClose}
      className={styles["sidebar-persona-memory-confirm"] ?? ""}
    >
      <p className={styles["sidebar-persona-memory-confirm-question"]}>
        「{props.line}」を消しますか
      </p>
      <p className={styles["sidebar-persona-memory-confirm-note"]}>消すと元に戻せない。</p>
      <HStack
        element="div"
        name={{ kind: "none" }}
        ref={undefined}
        gap="sm"
        align="stretch"
        justify="end"
        wrap="nowrap"
        className={styles["sidebar-persona-memory-confirm-actions"] ?? ""}
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
          className={styles["sidebar-persona-memory-confirm-cancel"] ?? ""}
          onClick={props.onClose}
        >
          キャンセル
        </Button>
        <Button
          type="button"
          variant="outline-warn"
          size="secondary"
          pressed="none"
          disabled={false}
          ariaLabel={undefined}
          ariaHasPopup={undefined}
          title={undefined}
          className={styles["sidebar-persona-memory-confirm-ok"] ?? ""}
          onClick={forget}
        >
          消す
        </Button>
      </HStack>
    </Dialog>
  )
}
