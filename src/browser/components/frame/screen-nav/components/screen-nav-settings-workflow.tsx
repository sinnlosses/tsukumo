// 設定のダイアログの「ワークフロー」の面。どのリポジトリの設定かを先頭に出し、欄を schema の順に置く。
// 並びの欄は頭の行・流れの帯・行の札（つかむ点・番号・名前・識別子・説明・「…」）・並びに入っていないスキルの札、
// 選択の欄は選択肢のラジオ（名前と説明）、コマンドの欄は1行のテキスト欄を置く。
// 読み取り専用の欄は名前・説明・値の字だけで、入力は置かない。
// 下の帯に「やめる」「保存」を置き、操作は保存するまで書かない。
// 欄はワークフローの設定コマンドから来たものだけで、出せないときは欄を出さずに何が無いかを1文で言う。

import { useRef, type ReactElement } from "react"

import { useExternalSync } from "../../../../hooks/use-external-sync.ts"
import { useUnmountEffect } from "../../../../hooks/use-mount-effect.ts"
import { useWorkflowSetting } from "../hooks/use-workflow-setting.ts"
import { useWorkflowDraft } from "../hooks/workflow-draft-store.ts"
import { ScreenNavSettingsFaceFrame } from "./screen-nav-settings-face-frame.tsx"
import type { ScreenNavSettingsStoreProps } from "./screen-nav-settings-store.tsx"
import { WorkflowField } from "./workflow-field/workflow-field.tsx"
import { WorkflowMessage } from "./workflow-message/workflow-message.tsx"
import { WorkflowRepository } from "./workflow-repository/workflow-repository.tsx"
import { WorkflowSaveBand } from "./workflow-save-band/workflow-save-band.tsx"

export function ScreenNavSettingsWorkflowFace(props: {
  readonly title: string
  readonly store: ScreenNavSettingsStoreProps
}): ReactElement {
  const setting = useWorkflowSetting()
  // 保存の口は描くたびに作り直されるので、預けるのは最新の口を呼ぶ1つの関数だけにして、件数が変わったときに預け直す。
  const latestSave = useRef<() => Promise<boolean>>(() => Promise.resolve(true))
  const draftCount = setting.kind === "available" ? setting.draftCount : 0
  const canSave = setting.kind === "available" ? setting.canSave : true
  useExternalSync(() => {
    if (setting.kind === "available") {
      latestSave.current = setting.saveAndWait
    }
  }, [setting])
  useExternalSync(() => {
    const { register, clear } = useWorkflowDraft.getState()
    if (draftCount > 0) {
      register({ count: draftCount, canSave, save: () => latestSave.current() })
    } else {
      clear()
    }
  }, [draftCount, canSave])
  useUnmountEffect(() => {
    useWorkflowDraft.getState().clear()
  })

  switch (setting.kind) {
    case "loading":
      return (
        <ScreenNavSettingsFaceFrame title={props.title} store={props.store} foot={undefined}>
          <WorkflowMessage text="ワークフローの設定を読んでいる…" tone="ink-quiet" />
        </ScreenNavSettingsFaceFrame>
      )
    case "unreachable":
      return (
        <ScreenNavSettingsFaceFrame title={props.title} store={props.store} foot={undefined}>
          <WorkflowMessage text={setting.message} tone="state-warn" />
        </ScreenNavSettingsFaceFrame>
      )
    case "unavailable":
      return (
        <ScreenNavSettingsFaceFrame title={props.title} store={props.store} foot={undefined}>
          <WorkflowRepository repository={setting.repository} />
          <WorkflowMessage text={setting.message} tone="ink" />
        </ScreenNavSettingsFaceFrame>
      )
    case "available":
      return (
        <ScreenNavSettingsFaceFrame
          title={props.title}
          store={props.store}
          foot={
            <WorkflowSaveBand
              change={setting.change}
              draftCount={setting.draftCount}
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
