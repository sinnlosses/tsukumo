// 設定のダイアログの「ワークフロー」の面。どのリポジトリの設定かを先頭に出し、欄ごとに行（名前＋プルダウン）を置く。
// 欄はワークフローの設定の口から来たものだけで、出せないときは欄を出さずに何が無いかを1文で言う。

import { useId, type ReactElement } from "react"

import { RunSettingName } from "../../../../features/run-setting/components/run-setting-option.tsx"
import { RunSettingSelect } from "../../../../features/run-setting/components/run-setting-select.tsx"
import { Button } from "../../../ui/button/button.tsx"
import { HStack } from "../../../ui/h-stack/h-stack.tsx"
import { Text } from "../../../ui/text/text.tsx"
import {
  useWorkflowSetting,
  type ScreenNavWorkflowSettingRepository,
  type ScreenNavWorkflowSettingRow,
} from "../hooks/use-workflow-setting.ts"
import styles from "./screen-nav-settings-workflow.module.css"
import rowStyles from "./screen-nav-settings.module.css"

export function ScreenNavSettingsWorkflowFace(): ReactElement {
  const setting = useWorkflowSetting()
  const fieldId = useId()

  switch (setting.kind) {
    case "loading":
      return <WorkflowMessage text="ワークフローの設定を読んでいる…" tone="ink-quiet" />
    case "unreachable":
      return <WorkflowMessage text={setting.message} tone="state-warn" />
    case "unavailable":
      return (
        <>
          <WorkflowRepository repository={setting.repository} />
          <WorkflowMessage text={setting.message} tone="ink" />
        </>
      )
    case "available":
      return (
        <>
          <WorkflowRepository repository={setting.repository} />
          {setting.rows.map((row) =>
            row.kind === "steps" ? (
              <WorkflowStepsRow
                key={row.key}
                row={row}
                busy={setting.busy}
                selectId={`${fieldId}-${row.key}`}
              />
            ) : (
              <div key={row.key} className={styles["field"]}>
                <HStack
                  element="div"
                  name={{ kind: "none" }}
                  ref={undefined}
                  gap="lg"
                  align="center"
                  justify="between"
                  wrap="nowrap"
                  className={rowStyles["screen-nav-settings-row"]}
                >
                  <label htmlFor={`${fieldId}-${row.key}`} title={row.description}>
                    {row.label}
                  </label>
                  <RunSettingSelect
                    id={`${fieldId}-${row.key}`}
                    ariaLabel={row.label}
                    heading={row.label}
                    value={row.value}
                    options={row.options.map((option) => ({
                      value: option.value,
                      disabled: false,
                      icon: undefined,
                      row: <RunSettingName danger={false}>{option.label}</RunSettingName>,
                    }))}
                    disabled={setting.busy}
                    danger={false}
                    rail={false}
                    layout="list"
                    mouth="field"
                    title={row.description}
                    dot="none"
                    onChange={(value) => {
                      setting.onChange(row.key, value)
                    }}
                  />
                </HStack>
                {row.notice.kind === "shown" && (
                  <Text
                    element="p"
                    size="label"
                    tone="state-warn"
                    weight="inherit"
                    className={styles["notice"]}
                  >
                    {row.notice.text}
                  </Text>
                )}
              </div>
            ),
          )}
        </>
      )
  }
}

const ADD_PLACEHOLDER_LABEL = "スキルを足す…"

function WorkflowStepsRow(props: {
  readonly row: Extract<ScreenNavWorkflowSettingRow, { kind: "steps" }>
  readonly busy: boolean
  readonly selectId: string
}): ReactElement {
  const { row, busy } = props
  return (
    <div className={styles["field"]}>
      <div className={rowStyles["screen-nav-settings-row"]}>
        <Text
          element="p"
          size="secondary"
          tone="ink"
          weight="bold"
          className={styles["steps-label"]}
        >
          {row.label}
        </Text>
        <Text
          element="p"
          size="label"
          tone="ink-quiet"
          weight="inherit"
          className={styles["steps-description"]}
        >
          {row.description}
        </Text>
      </div>
      <ol className={styles["steps"]} aria-label={row.label}>
        {row.steps.map((step, index) => (
          <li key={step.value} className={styles["step"]}>
            <span className={styles["step-name"]}>
              {step.label}
              {!step.known && (
                <Text
                  element="span"
                  size="label"
                  tone="state-warn"
                  weight="inherit"
                  className={styles["step-unknown"]}
                >
                  候補に無い
                </Text>
              )}
            </span>
            <span className={styles["step-buttons"]}>
              <StepButton
                label="上へ"
                name={`${step.label} を上へ`}
                disabled={busy || !step.canMoveUp}
                title={undefined}
                onClick={() => {
                  row.onMove(index, -1)
                }}
              />
              <StepButton
                label="下へ"
                name={`${step.label} を下へ`}
                disabled={busy || !step.canMoveDown}
                title={undefined}
                onClick={() => {
                  row.onMove(index, 1)
                }}
              />
              <StepButton
                label="外す"
                name={`${step.label} を外す`}
                disabled={busy || !step.canRemove}
                title={step.canRemove ? undefined : "並びは1つ以上いる"}
                onClick={() => {
                  row.onRemove(index)
                }}
              />
            </span>
          </li>
        ))}
      </ol>
      {row.addable.length > 0 && (
        <div className={styles["steps-add"]}>
          <RunSettingSelect
            id={props.selectId}
            ariaLabel={`${row.label}に足す`}
            heading={row.label}
            value=""
            options={[
              {
                value: "",
                disabled: true,
                icon: undefined,
                row: <RunSettingName danger={false}>{ADD_PLACEHOLDER_LABEL}</RunSettingName>,
              },
              ...row.addable.map((option) => ({
                value: option.value,
                disabled: false,
                icon: undefined,
                row: <RunSettingName danger={false}>{option.label}</RunSettingName>,
              })),
            ]}
            disabled={busy}
            danger={false}
            rail={false}
            layout="list"
            mouth="field"
            title={row.description}
            dot="none"
            onChange={(value) => {
              if (value !== "") {
                row.onAdd(value)
              }
            }}
          />
        </div>
      )}
      {row.notice.kind === "shown" && (
        <Text
          element="p"
          size="label"
          tone="state-warn"
          weight="inherit"
          className={styles["notice"]}
        >
          {row.notice.text}
        </Text>
      )}
    </div>
  )
}

function StepButton(props: {
  readonly label: string
  readonly name: string
  readonly disabled: boolean
  readonly title: string | undefined
  readonly onClick: () => void
}): ReactElement {
  return (
    <Button
      variant="outline"
      size="label"
      pressed="none"
      disabled={props.disabled}
      ariaLabel={props.name}
      ariaHasPopup={undefined}
      disclosure={{ kind: "none" }}
      title={props.title}
      className={styles["step-button"]}
      onClick={props.onClick}
    >
      {props.label}
    </Button>
  )
}

function WorkflowRepository(props: {
  readonly repository: ScreenNavWorkflowSettingRepository
}): ReactElement {
  return (
    <div className={styles["repository"]}>
      <Text
        element="p"
        size="secondary"
        tone="ink"
        weight="bold"
        className={styles["repository-name"]}
      >
        {props.repository.name} のリポジトリ
      </Text>
      <Text
        element="p"
        size="label"
        tone="ink-quiet"
        weight="inherit"
        className={styles["repository-path"]}
      >
        {props.repository.path}
      </Text>
    </div>
  )
}

function WorkflowMessage(props: {
  readonly text: string
  readonly tone: "ink" | "ink-quiet" | "state-warn"
}): ReactElement {
  return (
    <Text
      element="p"
      size="secondary"
      tone={props.tone}
      weight="inherit"
      className={styles["message"]}
    >
      {props.text}
    </Text>
  )
}
