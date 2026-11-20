// 設定のダイアログの中身。頭（歯車の線画・「設定」・×）、左のナビ、右の面を組む。
// 選んでいる面は開閉の店（`useSettingsRequest`）が持つので、閉じて開き直しても最後に見た面で開く。

import clsx from "clsx"
import { Settings, X } from "lucide-react"
import { Fragment, useState, type ReactElement } from "react"

import { SETTING_ENTRIES, SETTING_FACE_LABEL } from "../../../../domain/setting-entry.ts"
import { useSettingsRequest } from "../../../../stores/settings-request.ts"
import { Button } from "../../../ui/button/button.tsx"
import { Dialog } from "../../../ui/dialog/dialog.tsx"
import { TextField } from "../../../ui/text-field/text-field.tsx"
import { Text } from "../../../ui/text/text.tsx"
import { useWorkflowRepositoryName } from "../hooks/use-workflow-repository-name.ts"
import { useWorkflowDraft } from "../hooks/workflow-draft-store.ts"
import shellStyles from "../screen-nav.module.css"
import styles from "./screen-nav-settings-dialog.module.css"
import { ScreenNavSettingsFaceFrame } from "./screen-nav-settings-face-frame.tsx"
import { FACES, FACE_GROUPS, type Face } from "./screen-nav-settings-face.tsx"
import gearStyles from "./screen-nav-settings.module.css"
import type { ScreenNavSettingsProps } from "./screen-nav-settings.tsx"

/** 読み上げに渡す名前（歯車は絵だけなので、名前は `aria-label` と `title` で渡す）。 */
const SETTINGS_LABEL = "設定"

/** 保存するまで書かない面。未保存の印はこの面のナビにだけ出す。 */
const WORKFLOW_FACE_KEY = "workflow"

/** 帯の右端の歯車とダイアログ。置くのは広い画面の帯だけ（狭い画面では CSS の `@media` が帯から消す）。 */
export function ScreenNavSettingsGear(props: ScreenNavSettingsProps): ReactElement {
  const { settings } = props
  // 預け先はここで分解して受ける。
  // `settings.toggleRef` の形のまま `ref` に渡すと、`react(refs)` が `settings` への参照ごとレンダー中の ref の読み書きとみなして落ちる。
  const { toggleRef } = settings
  const guard = useDraftGuard(settings.onClose)

  // `shellStyles` の class は見た目を持たず、`screen-nav.module.css` の `@media` の選択子を当てるためだけに重ねる。
  return (
    <div className={clsx(gearStyles["screen-nav-settings"], shellStyles["screen-nav-settings"])}>
      <button
        type="button"
        ref={toggleRef}
        className={gearStyles["screen-nav-settings-toggle"]}
        aria-haspopup="dialog"
        aria-label={SETTINGS_LABEL}
        title={SETTINGS_LABEL}
        onClick={settings.onOpen}
      >
        <Settings size={18} strokeWidth={1.8} />
      </button>
      <Dialog
        open={settings.open}
        ariaLabel={SETTINGS_LABEL}
        backdrop="dim"
        placement={{ kind: "auto" }}
        onClose={guard.requestClose}
        className={styles["dialog"]}
      >
        {settings.open && <ScreenNavSettingsDialogBody settings={settings} guard={guard} />}
      </Dialog>
    </div>
  )
}

type DraftTarget = { readonly kind: "close" } | { readonly kind: "face"; readonly key: string }

type DraftPending = DraftTarget | { readonly kind: "none" }

type DraftGuard = {
  readonly draftCount: number
  readonly pending: DraftPending
  /** × ・Esc・背景の押下の口。確認が出ているあいだは確認をやめて面へ戻る。 */
  readonly requestClose: () => void
  readonly requestFace: (key: string) => void
  readonly onDiscard: () => void
  readonly onSave: () => void
  readonly canSave: boolean
}

/** 閉じる・ページを移るの口を1つにまとめ、ワークフローに未保存の下書きがあれば確認を挟む。 */
function useDraftGuard(close: () => void): DraftGuard {
  const entry = useWorkflowDraft((state) => state.entry)
  const selectFace = useSettingsRequest((state) => state.selectFace)
  const selectedKey = useSettingsRequest((state) => state.faceKey)
  const [pending, setPending] = useState<DraftPending>({ kind: "none" })
  const draftCount = entry?.count ?? 0

  function proceed(target: DraftTarget): void {
    setPending({ kind: "none" })
    if (target.kind === "close") {
      close()
    } else {
      selectFace(target.key)
    }
  }
  function request(target: DraftTarget): void {
    if (draftCount === 0) {
      proceed(target)
    } else {
      setPending(target)
    }
  }
  async function saveThenProceed(save: () => Promise<boolean>, target: DraftTarget): Promise<void> {
    if (await save()) {
      proceed(target)
    } else {
      setPending({ kind: "none" })
    }
  }

  return {
    draftCount,
    pending,
    canSave: entry?.canSave ?? true,
    requestClose: () => {
      if (pending.kind === "none") {
        request({ kind: "close" })
      } else {
        setPending({ kind: "none" })
      }
    },
    requestFace: (key) => {
      if (key !== (selectedKey ?? FACES[0].key)) {
        request({ kind: "face", key })
      }
    },
    onDiscard: () => {
      if (pending.kind !== "none") {
        proceed(pending)
      }
    },
    onSave: () => {
      if (pending.kind !== "none" && entry !== undefined) {
        void saveThenProceed(entry.save, pending)
      }
    },
  }
}

function ScreenNavSettingsDialogBody(
  props: ScreenNavSettingsProps & { readonly guard: DraftGuard },
): ReactElement {
  const { settings, guard } = props
  const selectedKey = useSettingsRequest((state) => state.faceKey)
  const selected: Face = FACES.find((face) => face.key === selectedKey) ?? FACES[0]
  const openSettings = useSettingsRequest((state) => state.openSettings)
  const repositoryName = useWorkflowRepositoryName()
  const [query, setQuery] = useState("")
  const word = query.trim()

  return (
    <>
      <header className={styles["head"]}>
        <Settings size={18} strokeWidth={1.8} className={styles["head-icon"]} />
        <Text
          element="p"
          size="subheading"
          tone="ink"
          weight="bold"
          className={styles["head-title"]}
        >
          設定
        </Text>
        <button
          type="button"
          className={styles["close"]}
          aria-label="閉じる（Esc）"
          onClick={guard.requestClose}
        >
          <X size={18} strokeWidth={1.8} />
        </button>
      </header>
      <div className={styles["main"]}>
        <nav className={styles["nav"]} aria-label="設定の項目">
          <div>
            <TextField
              element="input"
              id="settings-search"
              className={styles["search-input"]}
              value={query}
              placeholder="設定を探す"
              onChange={setQuery}
            />
          </div>
          {FACE_GROUPS.map((faceGroup) => {
            const aside = faceGroup.group === "repository" ? repositoryName : faceGroup.aside
            return (
              <Fragment key={faceGroup.group}>
                <Text
                  element="p"
                  size="label"
                  tone="ink-quiet"
                  weight="inherit"
                  className={styles["nav-group"]}
                >
                  <span>{faceGroup.label}</span>
                  {aside !== "" && <span>{aside}</span>}
                </Text>
                {FACES.filter((face) => face.group === faceGroup.group).map((face) => {
                  const Icon = face.icon
                  const isSelected = face.key === selected.key
                  const changedCount =
                    face.foot === "reset" ? settings.pageReset[face.key].count : 0
                  return (
                    <button
                      type="button"
                      key={face.key}
                      title={
                        face.key === WORKFLOW_FACE_KEY && guard.draftCount > 0
                          ? "未保存の変更がある"
                          : changedCount > 0
                            ? `既定と違う項目が ${String(changedCount)} 件ある`
                            : undefined
                      }
                      className={clsx(
                        styles["nav-item"],
                        isSelected && styles["nav-item-selected"],
                      )}
                      aria-current={isSelected ? "page" : undefined}
                      onClick={() => {
                        guard.requestFace(face.key)
                      }}
                    >
                      <Icon size={16} strokeWidth={1.8} />
                      {face.label}
                      {face.key === WORKFLOW_FACE_KEY && guard.draftCount > 0 && (
                        <span className={styles["nav-dirty"]} aria-hidden="true" />
                      )}
                      {changedCount > 0 && (
                        <span className={styles["nav-count"]} aria-hidden="true">
                          {changedCount}
                        </span>
                      )}
                    </button>
                  )
                })}
              </Fragment>
            )
          })}
        </nav>
        {word === "" ? (
          <section className={styles["face"]} aria-label={selected.label}>
            <SelectedFace face={selected} settings={settings} />
          </section>
        ) : (
          <section className={styles["face"]} aria-label="探した結果">
            <SearchResults
              word={word}
              onPick={(target) => {
                openSettings(target)
                setQuery("")
              }}
            />
          </section>
        )}
      </div>
      {guard.pending.kind !== "none" && (
        <div className={styles["confirm"]}>
          <div
            className={styles["confirm-box"]}
            role="alertdialog"
            aria-label="未保存の変更"
            aria-modal="true"
          >
            <Text
              element="p"
              size="body"
              tone="ink"
              weight="bold"
              className={styles["confirm-title"]}
            >
              ワークフローの変更が保存されていない
            </Text>
            <Text
              element="p"
              size="label"
              tone="ink-quiet"
              weight="inherit"
              className={styles["confirm-title"]}
            >
              {`.tw/config.toml へまだ書いていない変更が ${String(guard.draftCount)} 件ある。`}
            </Text>
            <div className={styles["confirm-actions"]}>
              <Button
                variant="outline"
                size="label"
                pressed="none"
                disabled={false}
                disclosure={{ kind: "none" }}
                className={styles["confirm-button"]}
                onClick={guard.onDiscard}
              >
                {guard.pending.kind === "close" ? "捨てて閉じる" : "捨てて移る"}
              </Button>
              <Button
                variant="solid-ink"
                size="label"
                pressed="none"
                disabled={!guard.canSave}
                disclosure={{ kind: "none" }}
                className={styles["confirm-button"]}
                onClick={guard.onSave}
              >
                {guard.pending.kind === "close" ? "保存して閉じる" : "保存して移る"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/** 当たった字を差し色にして返す。大文字小文字は区別しない。 */
function Highlighted(props: { readonly text: string; readonly word: string }): ReactElement {
  const { text, word } = props
  const at = text.toLowerCase().indexOf(word.toLowerCase())
  if (at < 0) {
    return <>{text}</>
  }
  const end = at + word.length
  return (
    <>
      {text.slice(0, at)}
      <mark className={styles["hit"]}>{text.slice(at, end)}</mark>
      {text.slice(end)}
    </>
  )
}

/** 名前か説明に語を含む項目を、宣言の並びのまま出す。当てる元は `SETTING_ENTRIES` だけ。 */
function SearchResults(props: {
  readonly word: string
  readonly onPick: (target: { readonly faceKey: string; readonly itemKey: string }) => void
}): ReactElement {
  const { word, onPick } = props
  const needle = word.toLowerCase()
  const hits = SETTING_ENTRIES.filter(
    (entry) =>
      entry.label.toLowerCase().includes(needle) ||
      entry.description.toLowerCase().includes(needle),
  )
  return (
    <div className={styles["results"]}>
      <Text
        element="p"
        size="subheading"
        tone="ink"
        weight="bold"
        className={styles["results-head"]}
      >
        {`「${word}」で探した結果`}
      </Text>
      {hits.length === 0 ? (
        <Text
          element="p"
          size="secondary"
          tone="ink-quiet"
          weight="inherit"
          className={styles["results-empty"]}
        >
          当たる設定が無い
        </Text>
      ) : (
        <ul className={styles["result-list"]}>
          {hits.map((entry) => (
            <li key={entry.itemKey}>
              <button
                type="button"
                className={styles["result"]}
                onClick={() => {
                  onPick({ faceKey: entry.faceKey, itemKey: entry.itemKey })
                }}
              >
                <span className={styles["result-name"]}>
                  <Highlighted text={entry.label} word={word} />
                </span>
                <span className={styles["result-note"]}>
                  {SETTING_FACE_LABEL[entry.faceKey]}
                  {" — "}
                  <Highlighted text={entry.description} word={word} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function SelectedFace(props: {
  readonly face: Face
  readonly settings: ScreenNavSettingsProps["settings"]
}): ReactElement {
  const { face, settings } = props
  if (face.foot === "own") {
    return <face.Body title={face.label} store={{ group: face.group, store: face.store }} />
  }
  const reset = settings.pageReset[face.key]
  return (
    <ScreenNavSettingsFaceFrame
      title={face.label}
      store={{ group: face.group, store: face.store }}
      foot={
        <Button
          variant="outline"
          size="label"
          pressed="none"
          disabled={reset.count === 0}
          disclosure={{ kind: "none" }}
          className={styles["reset"]}
          onClick={reset.onReset}
        >
          {`このページを既定に戻す（${String(reset.count)}件）`}
        </Button>
      }
    >
      <face.Body settings={settings} />
    </ScreenNavSettingsFaceFrame>
  )
}
