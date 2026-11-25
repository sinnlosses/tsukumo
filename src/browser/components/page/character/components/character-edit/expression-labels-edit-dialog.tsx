// 表情の名前（表情のカードの2行目）を設定するダイアログ本体。
// 開いている間だけ組み立てる。閉じたら呼び出し側がこの部品ごと外すので、次に開いたときは渡された初期値から下書きが始まる。
//
// 枠・見出し・footer の CSS は作るダイアログのクラス（`.character-create-*`）をそのまま流用する。

import { useState, type ReactElement } from "react"
import { fromKeys } from "remeda"

import { MAX_EXPRESSION_LABEL_LENGTH } from "../../../../../../shared/character-pack/character-definition.ts"
import { EXPRESSIONS, type Expression } from "../../../../../../shared/character-pack/expression.ts"
import { Button } from "../../../../ui/button/button.tsx"
import { Dialog } from "../../../../ui/dialog/dialog.tsx"
import { Field } from "../../../../ui/field/field.tsx"
import { Heading } from "../../../../ui/heading/heading.tsx"
import { Surface } from "../../../../ui/surface/surface.tsx"
import { TextField } from "../../../../ui/text-field/text-field.tsx"
import { Text } from "../../../../ui/text/text.tsx"
import styles from "../../character.module.css"
import type { ExpressionLabelsEditModel } from "../../domain/character-edit-model.ts"
import editStyles from "./character-edit.module.css"

const TITLE = "表情の名前を設定する"
const HINT =
  "表情のカードの2行目と、キャラクターに渡す表情の説明に出る名前。空にすると役割の名だけが出ます"

type Rows = Extract<ExpressionLabelsEditModel, { readonly kind: "shown" }>["rows"]

type ExpressionLabelsEditDialogProps = {
  /** 開いた時点の値。 */
  readonly rows: Rows
  /** 「保存する」を押したとき。押すとそのまま閉じる。 */
  readonly onSubmit: (labels: Readonly<Record<Expression, string>>) => void
  /** 「やめる」・Esc・外側のクリックのいずれでも呼ばれる。 */
  readonly onClose: () => void
}

export function ExpressionLabelsEditDialog(props: ExpressionLabelsEditDialogProps): ReactElement {
  const [labels, setLabels] = useState<Readonly<Record<Expression, string>>>(() =>
    labelsOf(props.rows),
  )

  function submit(): void {
    props.onSubmit(labels)
    props.onClose()
  }

  return (
    <Dialog
      open={true}
      ariaLabel={TITLE}
      backdrop="dim"
      placement={{ kind: "auto" }}
      onClose={props.onClose}
      className={styles["character-create-dialog"]}
    >
      <Surface
        element="div"
        tone="surface"
        space="none"
        radius="xl"
        shadow="none"
        className={styles["character-create-dialog-face"]}
      >
        <Heading
          level={2}
          size="heading"
          tone="inherit"
          weight="bold"
          className={styles["character-create-heading"]}
        >
          {TITLE}
        </Heading>
        <Text element="p" size="label" tone="ink-quiet" weight="inherit" className="">
          {HINT}
        </Text>
        <div className={editStyles["expression-labels-grid"]}>
          {props.rows.map((row) => {
            const id = `character-expression-label-${row.expression}`
            return (
              <Field key={row.expression} variant="form" id={id} label={row.role} hint={undefined}>
                <TextField
                  element="input"
                  id={id}
                  className={styles["character-create-input"]}
                  maxLength={MAX_EXPRESSION_LABEL_LENGTH}
                  value={labels[row.expression]}
                  onChange={(value) => {
                    setLabels((previous) => ({ ...previous, [row.expression]: value }))
                  }}
                />
              </Field>
            )
          })}
        </div>
        <div className={styles["character-create-footer"]}>
          <div className={styles["character-create-footer-spacer"]} />
          <Button
            variant="outline"
            size="secondary"
            pressed="none"
            disabled={false}
            disclosure={{ kind: "none" }}
            className={styles["character-button-outline"]}
            onClick={props.onClose}
          >
            やめる
          </Button>
          <Button
            variant="solid-accent"
            size="secondary"
            pressed="none"
            disabled={false}
            disclosure={{ kind: "none" }}
            className={styles["character-create-submit"]}
            onClick={submit}
          >
            <Text element="span" size="inherit" tone="inherit" weight="bold" className="">
              保存する
            </Text>
          </Button>
        </div>
      </Surface>
    </Dialog>
  )
}

function labelsOf(rows: Rows): Readonly<Record<Expression, string>> {
  return fromKeys(
    EXPRESSIONS,
    (expression) => rows.find((row) => row.expression === expression)?.label ?? "",
  )
}
