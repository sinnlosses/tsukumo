// 新しいキャラクターパックを作るダイアログの器。
// 見出し・立ち絵の口と「立ち絵から生成」・名前と id と画面の差し色2つ・人格・「やめる」「作る」を置く。
//
// `<dialog>` は top layer に出るので、キャラクター画面の `overflow` には切り取られない。

import type { ReactElement } from "react"

import { MAX_PERSONA_BODY_LENGTH } from "../../../../../../shared/character-pack/persona-section.ts"
import { Button } from "../../../../ui/button/button.tsx"
import { Dialog } from "../../../../ui/dialog/dialog.tsx"
import { Field } from "../../../../ui/field/field.tsx"
import { Heading } from "../../../../ui/heading/heading.tsx"
import { TextField } from "../../../../ui/text-field/text-field.tsx"
import { Text } from "../../../../ui/text/text.tsx"
import { VStack } from "../../../../ui/v-stack/v-stack.tsx"
import characterStyles from "../../character.module.css"
import { AccentSwatch } from "../accent-swatch/accent-swatch.tsx"
import styles from "./character-create.module.css"
import { PortraitDrop } from "./components/portrait-drop/portrait-drop.tsx"
import type { CharacterCreateModel } from "./hooks/use-character-create.ts"

type PresentationalCharacterCreateProps = CharacterCreateModel & {
  readonly onClose: () => void
}

export function PresentationalCharacterCreate({
  open,
  onClose,
  form,
}: PresentationalCharacterCreateProps): ReactElement {
  return (
    <Dialog
      open={open}
      ariaLabel="新しいキャラクターを作る"
      backdrop="dim"
      placement={{ kind: "auto" }}
      onClose={onClose}
      className={styles["character-create-dialog"]}
    >
      <VStack
        element="div"
        name={{ kind: "none" }}
        ref={undefined}
        gap="xl"
        align="stretch"
        justify="start"
        wrap="nowrap"
        className={styles["character-create-body"]}
      >
        <Heading
          level={2}
          size="heading"
          tone="inherit"
          weight="bold"
          className={characterStyles["character-create-heading"]}
        >
          新しいキャラクター
        </Heading>
        <div className={styles["character-create-grid"]}>
          <div className={styles["character-create-portrait"]}>
            <PortraitDrop drop={form.portrait} />
            <Button
              variant="outline"
              size="secondary"
              pressed="none"
              disabled={!form.generation.canGenerate}
              ariaLabel={undefined}
              disclosure={{ kind: "none" }}
              ariaHasPopup={undefined}
              title={undefined}
              className={characterStyles["character-button-outline"]}
              onClick={form.generation.onGenerate}
            >
              {form.generation.label}
            </Button>
            {form.generation.progress.kind === "running" ? (
              <ol className={styles["character-create-progress"]} aria-label="生成の進み">
                {form.generation.progress.steps.map((step) => (
                  <li
                    key={step.label}
                    className={styles["character-create-progress-item"]}
                    data-state={step.state}
                  >
                    {step.label}
                  </li>
                ))}
              </ol>
            ) : (
              <Text
                element="p"
                size="label"
                tone="ink-quiet"
                weight="inherit"
                className={styles["character-create-generation-note"]}
              >
                {form.generation.note.text}
              </Text>
            )}
          </div>
          <div className={styles["character-create-fields"]}>
            <Field
              variant="form"
              id="character-create-name"
              label="名前"
              hint={
                <Text element="span" size="label" tone="ink-quiet" weight="inherit" className="">
                  {form.nameHint}
                </Text>
              }
            >
              <TextField
                element="input"
                id="character-create-name"
                className={characterStyles["character-create-input"]}
                value={form.name}
                maxLength={undefined}
                placeholder={undefined}
                onChange={form.onNameChange}
              />
            </Field>
            <Field
              variant="form"
              id="character-create-id"
              label="id"
              hint={
                form.idNote.kind === "hint" ? (
                  <Text element="span" size="label" tone="ink-quiet" weight="inherit" className="">
                    {form.idNote.text}
                  </Text>
                ) : (
                  <Text
                    element="p"
                    size="label"
                    tone="ink-quiet"
                    weight="inherit"
                    className={characterStyles["character-screen-note"]}
                  >
                    {form.idNote.text}
                  </Text>
                )
              }
            >
              <TextField
                element="input"
                id="character-create-id"
                className={styles["character-create-input-mono"]}
                value={form.id}
                maxLength={undefined}
                placeholder={undefined}
                onChange={form.onIdChange}
              />
            </Field>
            <div className={characterStyles["character-create-field"]}>
              <span className={characterStyles["character-create-label"]}>画面の差し色</span>
              <div className={characterStyles["character-swatches-screen"]}>
                <AccentSwatch swatch={form.workAccent} disabled={false} />
                <AccentSwatch swatch={form.chatAccent} disabled={false} />
              </div>
            </div>
          </div>
        </div>
        <Field
          variant="form"
          id="character-create-persona"
          label="人格"
          hint={
            <Text element="span" size="label" tone="ink-quiet" weight="inherit" className="">
              {form.persona.hint}
            </Text>
          }
        >
          <TextField
            element="textarea"
            id="character-create-persona"
            className={characterStyles["character-persona-input"]}
            maxLength={MAX_PERSONA_BODY_LENGTH}
            placeholder={undefined}
            value={form.persona.value}
            onChange={form.persona.onChange}
          />
        </Field>
      </VStack>
      <div className={characterStyles["character-create-footer"]}>
        <Text element="span" size="label" tone="ink-quiet" weight="inherit" className="">
          背景と立ち絵の差し色は、作ったあとに設定できます
        </Text>
        <div className={characterStyles["character-create-footer-spacer"]} />
        <Button
          variant="outline"
          size="secondary"
          pressed="none"
          disabled={false}
          ariaLabel={undefined}
          disclosure={{ kind: "none" }}
          ariaHasPopup={undefined}
          title={undefined}
          className={characterStyles["character-button-outline"]}
          onClick={onClose}
        >
          やめる
        </Button>
        <Button
          variant="solid-accent"
          size="secondary"
          pressed="none"
          disabled={!form.canSubmit}
          ariaLabel={undefined}
          disclosure={{ kind: "none" }}
          ariaHasPopup={undefined}
          title={undefined}
          className={characterStyles["character-create-submit"]}
          onClick={form.onSubmit}
        >
          <Text element="span" size="inherit" tone="inherit" weight="bold" className="">
            作る
          </Text>
        </Button>
      </div>
    </Dialog>
  )
}
