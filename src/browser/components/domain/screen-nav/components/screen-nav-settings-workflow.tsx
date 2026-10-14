// 設定のダイアログの「ワークフロー」の面。どのリポジトリの設定かを先頭に出し、欄ごとに行（名前＋プルダウン）を置く。
// 欄はワークフローの設定の口から来たものだけで、出せないときは欄を出さずに何が無いかを1文で言う。

import { useId, type ReactElement } from "react"

import { RunSettingName } from "../../../../features/run-setting/components/run-setting-option.tsx"
import { RunSettingSelect } from "../../../../features/run-setting/components/run-setting-select.tsx"
import { HStack } from "../../../ui/h-stack/h-stack.tsx"
import { Text } from "../../../ui/text/text.tsx"
import {
  useWorkflowSetting,
  type ScreenNavWorkflowSettingRepository,
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
          {setting.rows.map((row) => (
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
          ))}
        </>
      )
  }
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
