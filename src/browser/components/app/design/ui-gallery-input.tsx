// 見本帳の `ui/` の節のうち、入力の部品（Field・TextField・Select・TabList・Slider・Switch）。

import { ArrowUp, Square } from "lucide-react"
import { useState, type ReactElement } from "react"

import { ComposerShell } from "../../ui/composer-shell/composer-shell.tsx"
import { Field } from "../../ui/field/field.tsx"
import { RoundButton } from "../../ui/round-button/round-button.tsx"
import { SearchField } from "../../ui/search-field/search-field.tsx"
import { Select } from "../../ui/select/select.tsx"
import { Slider } from "../../ui/slider/slider.tsx"
import { Switch } from "../../ui/switch/switch.tsx"
import { TabList } from "../../ui/tab-list/tab-list.tsx"
import { TextField } from "../../ui/text-field/text-field.tsx"
import { Text } from "../../ui/text/text.tsx"
import styles from "./design.module.css"
import { Group } from "./ui-gallery-group.tsx"

const SELECT_OPTIONS = [
  { value: "a", label: "選択肢その1" },
  { value: "b", label: "選択肢その2" },
] as const

export function InputGroups(): ReactElement {
  const [line, setLine] = useState("短い一行")
  const [area, setArea] = useState("複数行の\n入力欄")
  const [choice, setChoice] = useState("a")
  const [tab, setTab] = useState<"one" | "two" | "three">("one")
  const [amount, setAmount] = useState(3)
  const [enabled, setEnabled] = useState(false)

  return (
    <>
      <Group title="TextField（1行・複数行・押せない）" parts={["text-field"]}>
        <TextField
          element="input"
          id="design-text-field-line"
          className={styles["design-input"]}
          value={line}
          placeholder="1行"
          onChange={setLine}
        />
        <TextField
          element="textarea"
          id="design-text-field-area"
          className={styles["design-input"]}
          value={area}
          placeholder="複数行"
          onChange={setArea}
        />
        <TextField
          element="input"
          id="design-text-field-disabled"
          className={styles["design-input"]}
          value="押せない"
          disabled={true}
          onChange={setLine}
        />
      </Group>
      <Group title="SearchField（一覧を絞る検索欄）" parts={["search-field"]}>
        <SearchField
          label="見本を探す"
          value={line}
          listId="design-search-field-list"
          placeholder="探す"
          className={styles["design-input"]}
          onChange={setLine}
          onKeyDown={() => undefined}
        />
      </Group>
      <Group title="Field（form・confirm）" parts={["field"]}>
        <Field
          variant="form"
          id="design-field-form"
          label="名札（form）"
          hint={
            <Text element="span" size="secondary" tone="ink-quiet" weight="normal" className="">
              ヒントの一行
            </Text>
          }
        >
          <TextField
            element="input"
            id="design-field-form"
            className={styles["design-input"]}
            value={line}
            onChange={setLine}
          />
        </Field>
        <Field variant="confirm" id="design-field-confirm" label="名札（confirm）" hint={undefined}>
          <TextField
            element="input"
            id="design-field-confirm"
            className={styles["design-input"]}
            value={line}
            onChange={setLine}
          />
        </Field>
      </Group>
      <Group
        title="ComposerShell・RoundButton（入力欄の殻と円形の送信・中断）"
        parts={["composer-shell", "round-button"]}
      >
        <ComposerShell
          input={<textarea aria-label="見本の入力" placeholder="依頼する" rows={2} />}
          tools={
            <Text element="span" size="secondary" tone="ink-quiet" weight="normal" className="">
              道具
            </Text>
          }
          actions={
            <>
              <RoundButton
                action={{ kind: "press", onClick: noop }}
                ariaLabel="中断（見本）"
                title="中断"
                disabled={false}
                emphasis="neutral"
                className=""
              >
                <Square size={14} fill="currentColor" aria-hidden="true" />
              </RoundButton>
              <RoundButton
                action={{ kind: "press", onClick: noop }}
                ariaLabel="送信（見本）"
                title="送信"
                disabled={false}
                emphasis="solid"
                className=""
              >
                <ArrowUp size={16} aria-hidden="true" />
              </RoundButton>
            </>
          }
          className=""
        />
      </Group>
      <Group title="Select（選べる・押せない）" parts={["select"]}>
        <Select
          id="design-select"
          ariaLabel="選ぶ"
          frameClassName=""
          className={styles["design-select"]}
          value={choice}
          options={SELECT_OPTIONS}
          disabled={false}
          onChange={setChoice}
        />
        <Select
          id="design-select-disabled"
          ariaLabel="選べない"
          frameClassName=""
          className={styles["design-select"]}
          value={choice}
          options={SELECT_OPTIONS}
          disabled={true}
          title="選べない理由の一行"
          onChange={setChoice}
        />
      </Group>
      <Group title="TabList（切り替え）" parts={["tab-list"]}>
        <TabList
          label="見本のタブ"
          value={tab}
          tabs={SAMPLE_TABS}
          panelId="design-tab-panel"
          onChange={setTab}
        />
        <div role="tabpanel" id="design-tab-panel" aria-labelledby={`design-tab-${tab}`}>
          選んだタブ: {tab}
        </div>
      </Group>
      <Group title="Slider（動かせる・押せない）" parts={["slider"]}>
        <Slider
          label="動かせる"
          labelVisibility="shown"
          valueText="shown"
          value={amount}
          min={0}
          max={10}
          step={1}
          disabled={false}
          onChange={setAmount}
        />
        <Slider
          label="押せない"
          labelVisibility="shown"
          valueText="shown"
          value={amount}
          min={0}
          max={10}
          step={1}
          disabled={true}
          onChange={setAmount}
        />
      </Group>
      <Group title="Switch（切り替えられる・押せない）" parts={["switch"]}>
        <Switch label="切り替えられる" value={enabled} disabled={false} onChange={setEnabled} />
        <Switch label="押せない" value={enabled} disabled={true} onChange={setEnabled} />
      </Group>
    </>
  )
}

const SAMPLE_TABS = [
  { value: "one", label: "ひとつめ", id: "design-tab-one" },
  { value: "two", label: "ふたつめ", id: "design-tab-two" },
  { value: "three", label: "みっつめ", id: "design-tab-three" },
] as const

function noop(): void {}
