// セッションの切り替え画面（`docs/screen-design.md`「切り替え画面」）。帯の札を押すと開く
// モーダルで、左に探す欄と日付で区切った一覧、右に選んでいるセッションの要約と切り替えのボタン。
// ↑↓ で選び、Enter で切り替え、Esc で閉じる（Esc と外側のクリックは `<Dialog>` が持つ）。
//
// 中身（`SessionSwitcherBody`）は開いている間だけ描く。閉じて開き直すと探す欄と選びが初めに戻り、
// 選んだ1件の中身も取り直す。

import { Search } from "lucide-react"
import { useId, type ReactElement } from "react"

import type { CharacterFaceInfo } from "../../../../domain/character-face.ts"
import { Dialog } from "../../../ui/dialog/dialog.tsx"
import { CharacterFace } from "../../character-face.tsx"
import type { SessionDigestView } from "../hooks/use-session-digest.ts"
import { useSessionSwitcherSelection } from "../hooks/use-session-switcher-selection.ts"
import {
  SESSION_SWITCHER_GROUP_LABELS,
  type ScreenNavSessionSwitcher,
  type SessionSwitcherGroup,
  type SessionSwitcherRow,
} from "../hooks/use-session-switcher.ts"
import styles from "./session-switcher.module.css"

export type SessionSwitcherProps = {
  readonly switcher: ScreenNavSessionSwitcher
  /** 右の欄の見出しの横に添える、いまのキャラクターの顔と名前。 */
  readonly character: CharacterFaceInfo
}

const DIALOG_LABEL = "セッションを切り替える"
const SEARCH_PLACEHOLDER = "ID・依頼・タスク番号で探す"
const NEW_SESSION_LABEL = "＋ 新しいセッション"
const SUMMARY_HEADING = "このセッションの要約"
const LAST_LINE_HEADING = "最後のひとこと"
const NO_SUMMARY = "要約はまだ無い（このセッションの report に要約が書かれていない）"
const NO_MATCH = "当たるセッションが無い"
const NO_SESSIONS = "切り替えられるセッションはまだ無い"
const LOADING = "読み込み中…"
const UNAVAILABLE = "このセッションの記録は読めなかった"
const CURRENT_MARK = "いま"
const CURRENT_BUTTON = "いま出しているセッション"

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
      name={{ kind: "label", label: DIALOG_LABEL }}
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

  return (
    <div className={styles["session-switcher-frame"]}>
      <div className={styles["session-switcher-search"]}>
        <Search size={18} strokeWidth={2} aria-hidden="true" />
        <input
          type="search"
          className={styles["session-switcher-input"]}
          aria-label="セッションを探す"
          placeholder={SEARCH_PLACEHOLDER}
          value={selection.query}
          role="combobox"
          aria-expanded={true}
          aria-controls={`${idPrefix}-list`}
          aria-activedescendant={
            selection.selected === undefined ? undefined : optionId(selection.selected.sessionId)
          }
          autoFocus
          onChange={(event) => selection.onQueryChange(event.target.value)}
          onKeyDown={selection.onKeyDown}
        />
        <button
          type="button"
          className={styles["session-switcher-new"]}
          disabled={switcher.blocked}
          title={switcher.blockedTitle}
          onClick={switcher.onStartNew}
        >
          {NEW_SESSION_LABEL}
        </button>
      </div>
      <div className={styles["session-switcher-columns"]}>
        <div
          id={`${idPrefix}-list`}
          role="listbox"
          aria-label="セッション"
          className={styles["session-switcher-list"]}
        >
          {switcher.rows.length === 0 && (
            <p className={styles["session-switcher-empty"]}>{NO_SESSIONS}</p>
          )}
          {switcher.rows.length > 0 && selection.rows.length === 0 && (
            <p className={styles["session-switcher-empty"]}>{NO_MATCH}</p>
          )}
          {GROUP_ORDER.map((group) => ({
            group,
            rows: selection.rows.filter((row) => row.group === group),
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
                    data-current={row.current}
                    className={styles["session-switcher-row"]}
                    onClick={() => selection.onSelect(row.sessionId)}
                    onDoubleClick={() => switcher.onSwitch(row.sessionId)}
                  >
                    <span className={styles["session-switcher-row-id"]}>{row.shortId}</span>
                    <span className={styles["session-switcher-row-heading"]}>{row.heading}</span>
                    {row.current && (
                      <span className={styles["session-switcher-row-current"]}>{CURRENT_MARK}</span>
                    )}
                    <span className={styles["session-switcher-row-time"]}>{row.timeLabel}</span>
                  </div>
                ))}
              </div>
            ))}
        </div>
        {selection.selected !== undefined && (
          <SessionSwitcherDetail
            row={selection.selected}
            digest={selection.digest}
            character={character}
            blocked={switcher.blocked}
            blockedTitle={switcher.blockedTitle}
            onSwitch={switcher.onSwitch}
          />
        )}
      </div>
      <div className={styles["session-switcher-hints"]}>
        <span>
          <kbd>↑</kbd> <kbd>↓</kbd> 選ぶ
        </span>
        <span>
          <kbd>Enter</kbd> 切り替える
        </span>
        <span>
          <kbd>Esc</kbd> 閉じる
        </span>
      </div>
    </div>
  )
}

type SessionSwitcherDetailProps = {
  readonly row: SessionSwitcherRow
  readonly digest: SessionDigestView
  readonly character: CharacterFaceInfo
  readonly blocked: boolean
  readonly blockedTitle: string | undefined
  readonly onSwitch: (sessionId: string) => void
}

function SessionSwitcherDetail(props: SessionSwitcherDetailProps): ReactElement {
  const { row, digest, character } = props
  const meta =
    digest.kind === "known"
      ? `${row.rangeLabel} · 依頼 ${String(digest.requestCount)}`
      : row.rangeLabel
  return (
    <section className={styles["session-switcher-detail"]} aria-label={`セッション ${row.shortId}`}>
      <div className={styles["session-switcher-detail-head"]}>
        <span className={styles["session-switcher-detail-id"]}>{row.shortId}</span>
        <span className={styles["session-switcher-detail-meta"]}>{meta}</span>
        <span className={styles["session-switcher-detail-character"]}>
          <CharacterFace
            url={character.url}
            alt=""
            className={styles["session-switcher-detail-face"]}
          />
          {character.alt}
        </span>
      </div>
      <div className={styles["session-switcher-detail-body"]}>
        <DigestBody digest={digest} characterName={character.alt} />
      </div>
      <div className={styles["session-switcher-detail-foot"]}>
        <button
          type="button"
          className={styles["session-switcher-switch"]}
          disabled={props.blocked || row.current}
          title={row.current ? undefined : props.blockedTitle}
          onClick={() => props.onSwitch(row.sessionId)}
        >
          {row.current ? CURRENT_BUTTON : `${row.shortId} に切り替える`}
        </button>
      </div>
    </section>
  )
}

type DigestBodyProps = {
  readonly digest: SessionDigestView
  readonly characterName: string
}

function DigestBody(props: DigestBodyProps): ReactElement {
  const { digest } = props
  if (digest.kind === "loading") {
    return <p className={styles["session-switcher-note"]}>{LOADING}</p>
  }
  if (digest.kind === "unavailable") {
    return <p className={styles["session-switcher-note"]}>{UNAVAILABLE}</p>
  }
  return (
    <>
      <h3 className={styles["session-switcher-summary-heading"]}>{SUMMARY_HEADING}</h3>
      {digest.summary === undefined ? (
        <p className={styles["session-switcher-note"]}>{NO_SUMMARY}</p>
      ) : (
        summaryParagraphs(digest.summary).map((paragraph, index) => (
          <p
            key={`${String(index)}-${paragraph}`}
            className={styles["session-switcher-paragraph"]}
            data-remaining={paragraph.startsWith(REMAINING_PREFIX)}
          >
            {paragraph}
          </p>
        ))
      )}
      {digest.lastLine !== undefined && (
        <div className={styles["session-switcher-last-line"]}>
          <div className={styles["session-switcher-last-line-label"]}>{LAST_LINE_HEADING}</div>
          <div className={styles["session-switcher-last-line-text"]}>
            {props.characterName}「{digest.lastLine}」
          </div>
        </div>
      )}
    </>
  )
}

/** 残っていることの段落の書き出し（`REPORT_SESSION_SUMMARY_DESCRIPTION` がこう書かせる）。 */
const REMAINING_PREFIX = "残り"

/** 要約を段落に割る（空行でも改行1つでも段落の切れ目にする）。 */
function summaryParagraphs(summary: string): readonly string[] {
  return summary
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line !== "")
}
