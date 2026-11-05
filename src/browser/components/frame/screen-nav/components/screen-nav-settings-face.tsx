// 設定の面の表（`FACES`）と、その表から面を縦に並べた引き出しの中身（`ScreenNavSettingsBody`）。
// 面は `FACES` に1行ずつ宣言し、足すときはここへ1行書けばダイアログのナビと面、引き出しの両方に出る（引き出しに出すかは `inDrawer`）。

import { Palette, Play, SlidersHorizontal, Sparkles, Workflow } from "lucide-react"
import { Fragment, type ComponentType, type ReactElement } from "react"

import { Button } from "../../../ui/button/button.tsx"
import { HStack } from "../../../ui/h-stack/h-stack.tsx"
import { Text } from "../../../ui/text/text.tsx"
import { ScreenNavSettingsLookFace } from "./screen-nav-settings-look.tsx"
import { ScreenNavSettingsWorkflowFace } from "./screen-nav-settings-workflow.tsx"
import styles from "./screen-nav-settings.module.css"
import {
  ScreenNavSettingsLaunchSkillFace,
  ScreenNavSettingsRevealFace,
  ScreenNavSettingsSessionDefaultFace,
  type ScreenNavSettingsProps,
} from "./screen-nav-settings.tsx"

/**
 * `reset` の面はダイアログが枠を組み、下の帯に画面の色の「既定に戻す」を置く。引き出しにも出せる（`inDrawer`）。
 * `own` の面は色と関わらない値を書くので、自分で `ScreenNavSettingsFaceFrame` を組んで自分の下の帯を渡す。引き出しには置かない。
 */
export type Face = {
  readonly key: string
  readonly label: string
  readonly icon: ComponentType<{ readonly size: number; readonly strokeWidth: number }>
} & (
  | {
      readonly foot: "reset"
      readonly inDrawer: boolean
      readonly Body: (props: ScreenNavSettingsProps) => ReactElement
    }
  | {
      readonly foot: "own"
      readonly inDrawer: false
      readonly Body: (props: { readonly title: string }) => ReactElement
    }
)

export const FACES = [
  {
    key: "look",
    label: "見た目",
    icon: Palette,
    Body: ScreenNavSettingsLookFace,
    foot: "reset",
    inDrawer: true,
  },
  {
    key: "session-default",
    label: "セッションの既定",
    icon: SlidersHorizontal,
    Body: ScreenNavSettingsSessionDefaultFace,
    foot: "reset",
    inDrawer: true,
  },
  {
    key: "reveal",
    label: "演出",
    icon: Sparkles,
    Body: ScreenNavSettingsRevealFace,
    foot: "reset",
    inDrawer: true,
  },
  {
    key: "launch-skill",
    label: "タスクの実行",
    icon: Play,
    Body: ScreenNavSettingsLaunchSkillFace,
    foot: "reset",
    inDrawer: true,
  },
  // ワークフローの値は歯車の設定（`settings`）に無く、面が自分で読み書きする。
  {
    key: "workflow",
    label: "ワークフロー",
    icon: Workflow,
    Body: ScreenNavSettingsWorkflowFace,
    foot: "own",
    inDrawer: false,
  },
] satisfies readonly [Face, ...Face[]]

/** 引き出しの設定の面の中身（`inDrawer` の面を名前の見出し付きで縦に並べ、末尾に既定に戻す）。 */
export function ScreenNavSettingsBody(props: ScreenNavSettingsProps): ReactElement {
  const { settings } = props

  return (
    <>
      {FACES.map(
        (face) =>
          face.foot === "reset" &&
          face.inDrawer && (
            <Fragment key={face.key}>
              <Text
                element="p"
                size="label"
                tone="ink-quiet"
                weight="inherit"
                className={styles["screen-nav-settings-heading"]}
              >
                {face.label}
              </Text>
              <face.Body settings={settings} />
            </Fragment>
          ),
      )}
      <HStack
        element="div"
        name={{ kind: "none" }}
        gap="lg"
        align="center"
        justify="between"
        wrap="nowrap"
        className={styles["screen-nav-settings-row"]}
      >
        <Button
          variant="link"
          size="label"
          pressed="none"
          disabled={settings.resetDisabled}
          disclosure={{ kind: "none" }}
          className={styles["screen-nav-settings-reset"]}
          onClick={settings.onReset}
        >
          既定に戻す
        </Button>
      </HStack>
    </>
  )
}
