import type { MenuItem } from "../../../../ui/menu/menu.tsx"
import type {
  ScreenNavWorkflowSettingStep,
  ScreenNavWorkflowSettingStepsRow,
} from "../../hooks/use-workflow-setting.ts"

export function stepMenuItems(
  row: ScreenNavWorkflowSettingStepsRow,
  step: ScreenNavWorkflowSettingStep,
  index: number,
): readonly MenuItem[] {
  return [
    {
      key: "top",
      label: "いちばん上へ",
      tone: "default",
      disabled: !step.canMoveUp,
      separatorBefore: false,
      onSelect: () => {
        row.onMove(index, "top")
      },
    },
    {
      key: "up",
      label: "ひとつ上へ",
      tone: "default",
      disabled: !step.canMoveUp,
      separatorBefore: false,
      onSelect: () => {
        row.onMove(index, "up")
      },
    },
    {
      key: "down",
      label: "ひとつ下へ",
      tone: "default",
      disabled: !step.canMoveDown,
      separatorBefore: false,
      onSelect: () => {
        row.onMove(index, "down")
      },
    },
    {
      key: "bottom",
      label: "いちばん下へ",
      tone: "default",
      disabled: !step.canMoveDown,
      separatorBefore: false,
      onSelect: () => {
        row.onMove(index, "bottom")
      },
    },
    {
      key: "remove",
      label: "並びから外す",
      tone: "danger",
      disabled: !step.canRemove,
      separatorBefore: true,
      onSelect: () => {
        row.onRemove(index)
      },
    },
  ]
}
