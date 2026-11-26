// セッションの切り替え画面。帯の札を押すと開くモーダル。
// ↑↓ で選び、Enter で切り替え、Esc で閉じる（Esc と外側のクリックは `<Dialog>` が持つ）。
//
// 中身（`SessionSwitcherBody`）は開いている間だけ描く。
// 閉じて開き直すと探す欄と選びが初めに戻り、選んだ1件の中身も取り直す。

import { Search } from "lucide-react"
import { useId, type ReactElement } from "react"

import type { CharacterFaceInfo } from "../../../../domain/character-face.ts"
import { SessionSwitcherDetail } from "../../../../features/session-switcher/session-switcher-detail.tsx"
import {
  SESSION_SWITCHER_GROUP_LABELS,
  type SessionSwitcherGroup,
} from "../../../../features/session-switcher/session-switcher-row.ts"
import { Button } from "../../../ui/button/button.tsx"
import { Dialog } from "../../../ui/dialog/dialog.tsx"
import { Kbd } from "../../../ui/kbd/kbd.tsx"
import { SearchField } from "../../../ui/search-field/search-field.tsx"
import { Surface } from "../../../ui/surface/surface.tsx"
import { Text } from "../../../ui/text/text.tsx"
import { CharacterFace } from "../../character-face.tsx"
import { useSessionSwitcherSelection } from "../hooks/use-session-switcher-selection.ts"
import type { ScreenNavSessionSwitcher } from "../hooks/use-session-switcher.ts"
import styles from "./session-switcher.module.css"

type SessionSwitcherProps = {
  readonly switcher: ScreenNavSessionSwitcher
  /** 右の欄の見出しの横に添える、いまのキャラクターの顔と名前。 */
  readonly character: CharacterFaceInfo
}

const DIALOG_LABEL = "セッションを切り替える"
const SEARCH_PLACEHOLDER = "ID・依頼・タスク番号で探す"
const NEW_SESSION_LABEL = "＋ 新しいセッション"
const NO_MATCH = "当たるセッションが無い"
const NO_SESSIONS = "切り替えられるセッションはまだ無い"
const CURRENT_MARK = "いま"
const OCCUPIED_MARK = "別のウィンドウで使用中"
const THIS_WORKTREE = "この作業ツリー"
const OTHER_WORKTREES = "ほかの作業ツリー"

/** 一覧に出す日の区切りの順。 */
const GROUP_ORDER = [
  "today",
  "yesterday",
  "earlier",
] as const satisfies readonly SessionSwitcherGroup[]

export function SessionSwitcher(props: SessionSwitcherProps): ReactElement {
  const { switcher } = props
  return (
    <Dialog
      open={switcher.open}
      ariaLabel={DIALOG_LABEL}
      backdrop="dim"
      placement={{ kind: "auto" }}
      onClose={switcher.onClose}
      className={styles["session-switcher"]}
    >
      {switcher.open && <SessionSwitcherBody switcher={switcher} character={props.character} />}
    </Dialog>
  )
}

function SessionSwitcherBody(props: SessionSwitcherProps): ReactElement {
  const { switcher, character } = props
  const selection = useSessionSwitcherSelection(switcher.rows, switcher.onSwitch)
  const idPrefix = useId()
  const optionId = (sessionId: string): string => `${idPrefix}-${sessionId}`
  // 並びはサーバが「いまの作業ツリーが先」に揃えて届けるので、塊の順がキー操作の順と同じになる。
  const worktreeBlocks = [
    { label: THIS_WORKTREE, rows: selection.rows.filter((row) => row.inCurrentWorktree) },
    { label: OTHER_WORKTREES, rows: selection.rows.filter((row) => !row.inCurrentWorktree) },
  ].filter((block) => block.rows.length > 0)
  // 塊は両方に行があるときだけ見出しと group を持つ。
  const grouped = worktreeBlocks.length > 1

  return (
    <Surface
      element="div"
      tone="surface"
      space="none"
      radius="xl"
      shadow="none"
      className={styles["session-switcher-frame"]}
    >
      <div className={styles["session-switcher-search"]}>
        <Search size={18} strokeWidth={2} aria-hidden="true" />
        <SearchField
          label="セッションを探す"
          placeholder={SEARCH_PLACEHOLDER}
          value={selection.query}
          listId={`${idPrefix}-list`}
          activeOptionId={
            selection.selected === undefined ? undefined : optionId(selection.selected.sessionId)
          }
          hasAutoFocus
          className={styles["session-switcher-input"]}
          onChange={selection.onQueryChange}
          onKeyDown={selection.onKeyDown}
        />
        <Button
          variant="outline-dashed-accent-ink"
          size="secondary"
          pressed="none"
          disabled={switcher.blocked}
          disclosure={{ kind: "none" }}
          title={switcher.blockedTitle}
          className={styles["session-switcher-new"]}
          onClick={switcher.onStartNew}
        >
          {NEW_SESSION_LABEL}
        </Button>
      </div>
      <div className={styles["session-switcher-columns"]}>
        <div
          id={`${idPrefix}-list`}
          role="listbox"
          aria-label="セッション"
          className={styles["session-switcher-list"]}
        >
          {switcher.rows.length === 0 && (
            <Text
              element="p"
              size="secondary"
              tone="ink-quiet"
              weight="inherit"
              className={styles["session-switcher-empty"]}
            >
              {NO_SESSIONS}
            </Text>
          )}
          {switcher.rows.length > 0 && selection.rows.length === 0 && (
            <Text
              element="p"
              size="secondary"
              tone="ink-quiet"
              weight="inherit"
              className={styles["session-switcher-empty"]}
            >
              {NO_MATCH}
            </Text>
          )}
          {worktreeBlocks.map((block) => (
            <div
              key={block.label}
              role={grouped ? "group" : undefined}
              aria-label={grouped ? block.label : undefined}
            >
              {grouped && (
                <div className={styles["session-switcher-worktree-label"]} aria-hidden="true">
                  {block.label}
                </div>
              )}
              {GROUP_ORDER.map((group) => ({
                group,
                rows: block.rows.filter((row) => row.group === group),
              }))
                .filter(({ rows }) => rows.length > 0)
                .map(({ group, rows }) => (
                  <div key={group} role="group" aria-label={SESSION_SWITCHER_GROUP_LABELS[group]}>
                    <div className={styles["session-switcher-group-label"]} aria-hidden="true">
                      {SESSION_SWITCHER_GROUP_LABELS[group]}
                    </div>
                    {rows.map((row) => (
                      <div
                        key={row.sessionId}
                        id={optionId(row.sessionId)}
                        role="option"
                        aria-selected={row.sessionId === selection.selected?.sessionId}
                        aria-disabled={row.occupiedElsewhere}
                        data-current={row.current}
                        data-occupied={row.occupiedElsewhere}
                        data-blocked={switcher.blocked && !row.current}
                        title={switcher.blocked && !row.current ? switcher.blockedTitle : undefined}
                        className={styles["session-switcher-row"]}
                        onClick={() => selection.onSelect(row.sessionId)}
                        onDoubleClick={() => switcher.onSwitch(row.sessionId)}
                      >
                        <span className={styles["session-switcher-row-id"]}>{row.shortId}</span>
                        <span className={styles["session-switcher-row-body"]}>
                          <span className={styles["session-switcher-row-line"]}>
                            <Text
                              element="span"
                              size="secondary"
                              tone="inherit"
                              weight="inherit"
                              className={styles["session-switcher-row-heading"]}
                            >
                              {row.heading}
                            </Text>
                            {row.current && (
                              <Text
                                element="span"
                                size="label"
                                tone="accent"
                                weight="bold"
                                className={styles["session-switcher-row-current"]}
                              >
                                {CURRENT_MARK}
                              </Text>
                            )}
                            {row.occupiedElsewhere && (
                              <Text
                                element="span"
                                size="label"
                                tone="ink-quiet"
                                weight="inherit"
                                className={styles["session-switcher-row-current"]}
                              >
                                {OCCUPIED_MARK}
                              </Text>
                            )}
                          </span>
                          <span className={styles["session-switcher-row-line"]}>
                            <span
                              className={styles["session-switcher-row-worktree-title"]}
                              title={row.worktree}
                            >
                              <Text
                                element="span"
                                size="label"
                                tone="ink-quiet"
                                weight="inherit"
                                className={styles["session-switcher-row-worktree"]}
                              >
                                {row.worktree}
                              </Text>
                            </span>
                            <Text
                              element="span"
                              size="label"
                              tone="ink-quiet"
                              weight="inherit"
                              className={styles["session-switcher-row-time"]}
                            >
                              {row.timeLabel}
                            </Text>
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
            </div>
          ))}
        </div>
        {selection.selected !== undefined && (
          <SessionSwitcherDetail
            row={selection.selected}
            digest={selection.digest}
            characterName={character.alt}
            face={
              <CharacterFace
                url={character.url}
                alt=""
                className={styles["session-switcher-detail-face"]}
              />
            }
            showTitle={false}
            blocked={switcher.blocked}
            blockedTitle={switcher.blockedTitle}
            onSwitch={switcher.onSwitch}
          />
        )}
      </div>
      <div className={styles["session-switcher-hints"]}>
        <Text element="span" size="inherit" tone="inherit" weight="inherit" className="">
          <Kbd keys="↑" /> <Kbd keys="↓" /> 選ぶ
        </Text>
        <Text element="span" size="inherit" tone="inherit" weight="inherit" className="">
          <Kbd keys="Enter" /> 切り替える
        </Text>
        <Text element="span" size="inherit" tone="inherit" weight="inherit" className="">
          <Kbd keys="Esc" /> 閉じる
        </Text>
      </div>
    </Surface>
  )
}
