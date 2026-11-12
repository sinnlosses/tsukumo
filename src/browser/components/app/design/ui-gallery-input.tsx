// 見本帳の `ui/` の節のうち、入力の部品（Field・TextField・Select）。

import { useState, type ReactElement } from "react"

import { Chip } from "../../ui/chip/chip.tsx"
import { Field } from "../../ui/field/field.tsx"
import { Segmented } from "../../ui/segmented/segmented.tsx"
import { Select } from "../../ui/select/select.tsx"
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
  const [mode, setMode] = useState("work")
  const [filter, setFilter] = useState(true)

  return (
    <>
      <Group title="Chip（入口の札・絞り込み・入力欄の札）" parts={["chip"]}>
        <Chip
          label="タスク"
          count={{ kind: "shown", value: 3 }}
          action={{ kind: "button", pressed: false, onClick: () => {} }}
          className=""
        />
        <Chip
          label="進行中"
          count={{ kind: "none" }}
          action={{ kind: "button", pressed: filter, onClick: () => setFilter(!filter) }}
          className=""
        />
        <Chip label="Fable・高" count={{ kind: "none" }} action={{ kind: "static" }} className="" />
      </Group>
      <Group title="Segmented（仕事と雑談）" parts={["segmented"]}>
        <Segmented
          ariaLabel="見本の切り替え"
          value={mode}
          options={[
            { value: "work", label: "仕事" },
            { value: "chat", label: "雑談" },
          ]}
          onChange={setMode}
        />
      </Group>
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
    </>
  )
}
