// 新しいキャラクターパックを作るダイアログの器。
// 見出し・立ち絵の口・名前と id と画面の差し色2つ・「やめる」「作る」を置く。
//
// `<dialog>` は top layer に出るので、キャラクター画面の `overflow` には切り取られない。

import clsx from "clsx"
import type { ReactElement } from "react"

import { Button } from "../../../../ui/button/button.tsx"
import { Dialog } from "../../../../ui/dialog/dialog.tsx"
import { Heading } from "../../../../ui/heading/heading.tsx"
import { Text } from "../../../../ui/text/text.tsx"
import { VStack } from "../../../../ui/v-stack/v-stack.tsx"
import characterStyles from "../../character.module.css"
import { AccentSwatch } from "../accent-swatch/accent-swatch.tsx"
import styles from "./character-create.module.css"
import { PortraitDrop } from "./components/portrait-drop/portrait-drop.tsx"
import type { CharacterCreateModel } from "./hooks/use-character-create.ts"

export type PresentationalCharacterCreateProps = CharacterCreateModel & {
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
      name={{ kind: "label", label: "新しいキャラクターを作る" }}
      backdrop="dim"
      placement={{ kind: "auto" }}
      onClose={onClose}
      className={characterStyles["character-create-dialog"]}
    >
      <VStack
        element="div"
        name={{ kind: "none" }}
        ref={undefined}
        gap="xl"
        align="stretch"
        justify="start"
        wrap="nowrap"
        className=""
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
          <PortraitDrop drop={form.portrait} />
          <div className={styles["character-create-fields"]}>
            <div className={characterStyles["character-create-field"]}>
              <label
                className={characterStyles["character-create-label"]}
                htmlFor="character-create-name"
              >
                名前
              </label>
              <input
                id="character-create-name"
                type="text"
                className={characterStyles["character-create-input"]}
                value={form.name}
                onChange={(event) => form.onNameChange(event.target.value)}
              />
              <Text element="span" size="label" tone="ink-quiet" weight="inherit" className="">
                {form.nameHint}
              </Text>
            </div>
            <div className={characterStyles["character-create-field"]}>
              <label
                className={characterStyles["character-create-label"]}
                htmlFor="character-create-id"
              >
                id
              </label>
              <input
                id="character-create-id"
                type="text"
                className={clsx(
                  characterStyles["character-create-input"],
                  styles["character-create-input-mono"],
                )}
                value={form.id}
                onChange={(event) => form.onIdChange(event.target.value)}
              />
              {form.idNote.kind === "hint" ? (
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
              )}
            </div>
            <div className={characterStyles["character-create-field"]}>
              <span className={characterStyles["character-create-label"]}>画面の差し色</span>
              <div className={characterStyles["character-swatches-screen"]}>
                <AccentSwatch swatch={form.workAccent} disabled={false} />
                <AccentSwatch swatch={form.chatAccent} disabled={false} />
              </div>
            </div>
          </div>
        </div>
        <div className={characterStyles["character-create-footer"]}>
          <Text element="span" size="label" tone="ink-quiet" weight="inherit" className="">
            背景と立ち絵の差し色は、作ったあとに設定できます
          </Text>
          <div className={characterStyles["character-create-footer-spacer"]} />
          <Button
            type="button"
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
            type="button"
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
      </VStack>
    </Dialog>
  )
}
