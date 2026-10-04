// プロジェクトの設定（起動先の `.tsukumo/project.json`）を書くダイアログ。
// サイドバーのタスクの節から開く（設定が無いときの「⚙ 設定する」と、節の見出しの歯車）。
// 説明の文を置かず、見た目で伝える: 見出しの横に書き先のパス、推し量った値の欄は点線と薄い字、頼む文面の `{id}` は差し色の札、読めないときは赤い札。

import clsx from "clsx"
import { type ReactElement, useRef } from "react"

import { TASK_STORES, type TaskStore } from "../../../../../shared/repository/project-settings.ts"
import { Button } from "../../../ui/button/button.tsx"
import { Dialog } from "../../../ui/dialog/dialog.tsx"
import { Heading } from "../../../ui/heading/heading.tsx"
import { Text } from "../../../ui/text/text.tsx"
import {
  type ProjectSettingsFieldModel,
  type ProjectSettingsFormModel,
  useProjectSettingsDialog,
} from "../hooks/use-project-settings-dialog.ts"
import styles from "./project-settings-dialog.module.css"

/** ダイアログの名前と、開く口の読み上げの名前。 */
export const PROJECT_SETTINGS_LABEL = "プロジェクトの設定"

/** 頼む文面のうち、タスクIDに置き換わる部分。 */
const RUN_PROMPT_ID_TOKEN = "{id}"

export type ProjectSettingsDialogProps = {
  readonly open: boolean
  readonly onClose: () => void
}

export function ProjectSettingsDialog(props: ProjectSettingsDialogProps): ReactElement {
  const dialog = useProjectSettingsDialog(props.open, props.onClose)

  return (
    <Dialog
      open={dialog.open}
      ariaLabel={PROJECT_SETTINGS_LABEL}
      backdrop="dim"
      placement={{ kind: "auto" }}
      onClose={dialog.onClose}
      className={styles["project-settings-dialog"]}
    >
      <div className={styles["project-settings-head"]}>
        <Heading level={2} size="heading" tone="inherit" weight="bold" className="">
          プロジェクト
        </Heading>
        <Text
          element="span"
          size="label"
          tone="ink-quiet"
          weight="inherit"
          className={styles["project-settings-path"]}
        >
          {dialog.path}
        </Text>
        {dialog.form.kind === "ready" && dialog.form.model.fileInvalid && (
          <Text
            element="span"
            size="label"
            tone="state-ng"
            weight="inherit"
            className={styles["project-settings-badge"]}
          >
            読めない
          </Text>
        )}
      </div>
      {dialog.form.kind === "ready" && (
        <ProjectSettingsForm form={dialog.form.model} onClose={dialog.onClose} />
      )}
    </Dialog>
  )
}

type ProjectSettingsFormProps = {
  readonly form: ProjectSettingsFormModel
  readonly onClose: () => void
}

function ProjectSettingsForm({ form, onClose }: ProjectSettingsFormProps): ReactElement {
  return (
    <>
      <div className={styles["project-settings-grid"]}>
        <span className={styles["project-settings-label"]} id="project-settings-store">
          タスク
        </span>
        <StoreSwitch field={form.store} />
        <label className={styles["project-settings-label"]} htmlFor="project-settings-main-branch">
          主ブランチ
        </label>
        <input
          id="project-settings-main-branch"
          type="text"
          spellCheck={false}
          className={clsx(
            styles["project-settings-input"],
            styles["project-settings-branch"],
            form.mainBranch.inferred && styles["project-settings-inferred"],
          )}
          value={form.mainBranch.value}
          onFocus={form.mainBranch.onTouch}
          onChange={(event) => form.mainBranch.onChange(event.target.value)}
        />
        <label className={styles["project-settings-label"]} htmlFor="project-settings-run-prompt">
          頼む文面
        </label>
        <RunPromptInput field={form.runPrompt} />
      </div>
      <div className={styles["project-settings-foot"]}>
        <Button
          variant="outline"
          size="secondary"
          pressed="none"
          disabled={false}
          ariaLabel={undefined}
          ariaHasPopup={undefined}
          disclosure={{ kind: "none" }}
          title={undefined}
          className={styles["project-settings-button"]}
          onClick={onClose}
        >
          やめる
        </Button>
        <Button
          variant="solid-accent"
          size="secondary"
          pressed="none"
          disabled={!form.canSave}
          ariaLabel={undefined}
          ariaHasPopup={undefined}
          disclosure={{ kind: "none" }}
          title={undefined}
          className={styles["project-settings-button"]}
          onClick={form.onSave}
        >
          <Text element="span" size="inherit" tone="inherit" weight="bold" className="">
            保存
          </Text>
        </Button>
        {form.confirming && <OverwriteConfirm form={form} />}
      </div>
    </>
  )
}

type StoreSwitchProps = {
  readonly field: ProjectSettingsFieldModel<TaskStore>
}

function StoreSwitch({ field }: StoreSwitchProps): ReactElement {
  return (
    <div
      role="group"
      aria-labelledby="project-settings-store"
      className={clsx(
        styles["project-settings-switch"],
        field.inferred && styles["project-settings-inferred"],
      )}
    >
      {TASK_STORES.map((store) => (
        <button
          key={store}
          type="button"
          aria-pressed={field.value === store}
          className={styles["project-settings-switch-option"]}
          onClick={() => field.onChange(store)}
        >
          {store}
        </button>
      ))}
    </div>
  )
}

type RunPromptInputProps = {
  readonly field: ProjectSettingsFieldModel<string>
}

/**
 * 頼む文面の欄。`{id}` を札で見せるため、同じ字送りの写しを入力欄の下に重ね、入力欄の字は透かす。
 * 写しと入力欄は等幅の同じ書体・同じ余白にしてあり、横に流れたときは入力欄の送りを写しに移す。
 */
function RunPromptInput({ field }: RunPromptInputProps): ReactElement {
  const mirrorRef = useRef<HTMLDivElement>(null)
  return (
    <div
      className={clsx(
        styles["project-settings-input"],
        styles["project-settings-prompt"],
        field.inferred && styles["project-settings-inferred"],
      )}
    >
      <div ref={mirrorRef} aria-hidden="true" className={styles["project-settings-prompt-mirror"]}>
        {runPromptParts(field.value).map((part) => (
          <span key={part.offset} className={clsx(part.token && styles["project-settings-token"])}>
            {part.text}
          </span>
        ))}
      </div>
      <input
        id="project-settings-run-prompt"
        type="text"
        spellCheck={false}
        className={styles["project-settings-prompt-input"]}
        value={field.value}
        onFocus={field.onTouch}
        onChange={(event) => field.onChange(event.target.value)}
        onScroll={(event) => {
          if (mirrorRef.current !== null) {
            mirrorRef.current.scrollLeft = event.currentTarget.scrollLeft
          }
        }}
      />
    </div>
  )
}

type OverwriteConfirmProps = {
  readonly form: ProjectSettingsFormModel
}

function OverwriteConfirm({ form }: OverwriteConfirmProps): ReactElement {
  return (
    <div role="group" aria-label="上書きする？" className={styles["project-settings-confirm"]}>
      <Text element="p" size="subheading" tone="ink" weight="bold" className="">
        上書きする？
      </Text>
      <div className={styles["project-settings-confirm-actions"]}>
        <Button
          variant="outline"
          size="secondary"
          pressed="none"
          disabled={false}
          ariaLabel={undefined}
          ariaHasPopup={undefined}
          disclosure={{ kind: "none" }}
          title={undefined}
          className={styles["project-settings-button"]}
          onClick={form.onCancelOverwrite}
        >
          やめる
        </Button>
        <Button
          variant="outline-soft-danger"
          size="secondary"
          pressed="none"
          disabled={false}
          ariaLabel={undefined}
          ariaHasPopup={undefined}
          disclosure={{ kind: "none" }}
          title={undefined}
          className={styles["project-settings-button"]}
          onClick={form.onConfirmOverwrite}
        >
          上書き
        </Button>
      </div>
    </div>
  )
}

type RunPromptPart = {
  readonly offset: number
  readonly text: string
  readonly token: boolean
}

/** 文面を `{id}` とそれ以外に切る。`offset` は文面の中の位置（並びの鍵）。 */
function runPromptParts(value: string): readonly RunPromptPart[] {
  return value
    .split(/(\{id\})/)
    .filter((text) => text !== "")
    .reduce<{ readonly offset: number; readonly parts: readonly RunPromptPart[] }>(
      (acc, text) => ({
        offset: acc.offset + text.length,
        parts: [...acc.parts, { offset: acc.offset, text, token: text === RUN_PROMPT_ID_TOKEN }],
      }),
      { offset: 0, parts: [] },
    ).parts
}
