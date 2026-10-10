// セッションの切り替え画面。帯の札を押すと開くモーダル。
// ↑↓ で選び、Enter で切り替え、Esc で閉じる（Esc と外側のクリックは `<Dialog>` が持つ）。
//
// 中身（`SessionSwitcherBody`）は開いている間だけ描く。
// 閉じて開き直すと探す欄と選びが初めに戻り、選んだ1件の中身も取り直す。

import { Search } from "lucide-react"
import { useId, type ReactElement } from "react"

import type { CharacterFaceInfo } from "../../../../domain/character-face.ts"
import { REMAINING_PREFIX, summaryParagraphs } from "../../../../domain/session-summary.ts"
import { Button } from "../../../ui/button/button.tsx"
import { Dialog } from "../../../ui/dialog/dialog.tsx"
import { Heading } from "../../../ui/heading/heading.tsx"
import { Text } from "../../../ui/text/text.tsx"
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
const OCCUPIED_MARK = "別の窓で使用中"
const THIS_WORKTREE = "この作業ツリー"
const OTHER_WORKTREES = "ほかの作業ツリー"
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
        <Button
          variant="outline-dashed-accent-ink"
          size="secondary"
          pressed="none"
          disabled={switcher.blocked}
          ariaLabel={undefined}
          ariaHasPopup={undefined}
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
                        className={styles["session-switcher-row"]}
                        onClick={() => selection.onSelect(row.sessionId)}
                        onDoubleClick={() => switcher.onSwitch(row.sessionId)}
                      >
                        <span className={styles["session-switcher-row-id"]}>{row.shortId}</span>
                        <Text
                          element="span"
                          size="secondary"
                          tone="inherit"
                          weight="inherit"
                          className={styles["session-switcher-row-heading"]}
                        >
                          {row.heading}
                        </Text>
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
                        <Text
                          element="span"
                          size="label"
                          tone="ink-quiet"
                          weight="inherit"
                          className={styles["session-switcher-row-time"]}
                        >
                          {row.timeLabel}
                        </Text>
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
            character={character}
            blocked={switcher.blocked}
            blockedTitle={switcher.blockedTitle}
            onSwitch={switcher.onSwitch}
          />
        )}
      </div>
      <div className={styles["session-switcher-hints"]}>
        <Text element="span" size="inherit" tone="inherit" weight="inherit" className="">
          <kbd>↑</kbd> <kbd>↓</kbd> 選ぶ
        </Text>
        <Text element="span" size="inherit" tone="inherit" weight="inherit" className="">
          <kbd>Enter</kbd> 切り替える
        </Text>
        <Text element="span" size="inherit" tone="inherit" weight="inherit" className="">
          <kbd>Esc</kbd> 閉じる
        </Text>
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
        <Text
          element="span"
          size="action"
          tone="ink-quiet"
          weight="inherit"
          className={styles["session-switcher-detail-meta"]}
        >
          {meta}
        </Text>
        <Text
          element="span"
          size="action"
          tone="ink-quiet"
          weight="inherit"
          className={styles["session-switcher-detail-character"]}
        >
          <CharacterFace
            url={character.url}
            alt=""
            className={styles["session-switcher-detail-face"]}
          />
          {character.alt}
        </Text>
      </div>
      <div className={styles["session-switcher-detail-body"]}>
        <DigestBody digest={digest} characterName={character.alt} />
      </div>
      <div className={styles["session-switcher-detail-foot"]}>
        <Button
          variant="solid-accent-static"
          size="subheading"
          pressed="none"
          disabled={props.blocked || row.current}
          ariaLabel={undefined}
          ariaHasPopup={undefined}
          disclosure={{ kind: "none" }}
          title={row.current ? undefined : props.blockedTitle}
          className={styles["session-switcher-switch"]}
          onClick={() => props.onSwitch(row.sessionId)}
        >
          <Text element="span" size="inherit" tone="inherit" weight="bold" className="">
            {row.current ? CURRENT_BUTTON : `${row.shortId} に切り替える`}
          </Text>
        </Button>
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
    return (
      <Text element="p" size="secondary" tone="ink-quiet" weight="inherit" className="">
        {LOADING}
      </Text>
    )
  }
  if (digest.kind === "unavailable") {
    return (
      <Text element="p" size="secondary" tone="ink-quiet" weight="inherit" className="">
        {UNAVAILABLE}
      </Text>
    )
  }
  return (
    <>
      <Heading
        level={3}
        size="action"
        tone="accent"
        weight="bold"
        className={styles["session-switcher-summary-heading"]}
      >
        {SUMMARY_HEADING}
      </Heading>
      {digest.summary === undefined ? (
        <Text element="p" size="secondary" tone="ink-quiet" weight="inherit" className="">
          {NO_SUMMARY}
        </Text>
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
