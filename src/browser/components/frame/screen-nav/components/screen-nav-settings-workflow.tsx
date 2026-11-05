// 設定のダイアログの「ワークフロー」の面。どのリポジトリの設定かを先頭に出し、欄を schema の順に置く。
// 並びの欄は頭の行・流れの帯・行の札（つかむ点・番号・名前・識別子・説明・「…」）・並びに入っていないスキルの札、
// 選択の欄は選択肢のラジオ（名前と説明）、コマンドの欄は1行のテキスト欄を置く。
// 読み取り専用の欄は名前・説明・値の字だけで、入力は置かない。
// 下の帯に「やめる」「保存」を置き、操作は保存するまで書かない。
// 欄はワークフローの設定コマンドから来たものだけで、出せないときは欄を出さずに何が無いかを1文で言う。

import type { ReactElement } from "react"

import { useWorkflowSetting } from "../hooks/use-workflow-setting.ts"
import { ScreenNavSettingsFaceFrame } from "./screen-nav-settings-face-frame.tsx"
import { WorkflowField } from "./workflow-field/workflow-field.tsx"
import { WorkflowMessage } from "./workflow-message/workflow-message.tsx"
import { WorkflowRepository } from "./workflow-repository/workflow-repository.tsx"
import { WorkflowSaveBand } from "./workflow-save-band/workflow-save-band.tsx"

export function ScreenNavSettingsWorkflowFace(props: { readonly title: string }): ReactElement {
  const setting = useWorkflowSetting()

  switch (setting.kind) {
    case "loading":
      return (
        <ScreenNavSettingsFaceFrame title={props.title} foot={undefined}>
          <WorkflowMessage text="ワークフローの設定を読んでいる…" tone="ink-quiet" />
        </ScreenNavSettingsFaceFrame>
      )
    case "unreachable":
      return (
        <ScreenNavSettingsFaceFrame title={props.title} foot={undefined}>
          <WorkflowMessage text={setting.message} tone="state-warn" />
        </ScreenNavSettingsFaceFrame>
      )
    case "unavailable":
      return (
        <ScreenNavSettingsFaceFrame title={props.title} foot={undefined}>
          <WorkflowRepository repository={setting.repository} />
          <WorkflowMessage text={setting.message} tone="ink" />
        </ScreenNavSettingsFaceFrame>
      )
    case "available":
      return (
        <ScreenNavSettingsFaceFrame
          title={props.title}
          foot={
            <WorkflowSaveBand
              change={setting.change}
              busy={setting.busy}
              onSave={setting.onSave}
              onCancel={setting.onCancel}
              canSave={setting.canSave}
            />
          }
        >
          <WorkflowRepository repository={setting.repository} />
          {setting.rows.map((row) => (
            <WorkflowField key={row.key} row={row} busy={setting.busy} />
          ))}
        </ScreenNavSettingsFaceFrame>
      )
  }
}
