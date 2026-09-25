// **新しいキャラクターパックを作るダイアログ**（`docs/design.md` 7.1 / `docs/screen-design.md` 13.6）の
// **器だけ**（<PresentationalCharacterCreate>）。見出し・立ち絵の口（`components/portrait-drop.tsx`）・
// 名前と id と画面の差し色2つ（`components/accent-swatch.tsx`）・「やめる」「作る」を置く。
// フックも算出も持たず、`hooks/use-character-create.ts` が畳んだ値をそのまま置く
// （docs/design.md 2章「機能の中を分ける」）。
//
// **`<dialog>` は top layer に出る**ので、キャラクター画面の `overflow` には切り取られない。
// Esc で閉じるのはブラウザのモーダル挙動に任せ、閉じたときの後始末（下書きを空へ戻す）は
// `<dialog onClose={onClose}>` を通す（`onClose` はフックを介さず呼び出し側から直接渡る。
// `character-create.tsx`）。

import { type ReactElement } from "react"

import { Button } from "../../../components/ui/button/button.tsx"
import { Heading } from "../../../components/ui/heading/heading.tsx"
import { Text } from "../../../components/ui/text/text.tsx"
import { VStack } from "../../../components/ui/v-stack/v-stack.tsx"
import styles from "./character-screen.module.css"
import { AccentSwatch } from "./components/accent-swatch.tsx"
import { PortraitDrop } from "./components/portrait-drop.tsx"
import { type CharacterCreateModel } from "./hooks/use-character-create.ts"

export type PresentationalCharacterCreateProps = CharacterCreateModel & {
  readonly onClose: () => void
}

/** **props はここだけ分解して受ける**（`presentational-task-board.tsx` と同じ理由。`ref` を
 * `props.ref` の形で描画中に読むと react(refs) が落ちるため）。 */
export function PresentationalCharacterCreate({
  ref,
  onDialogClick,
  onClose,
  form,
}: PresentationalCharacterCreateProps): ReactElement {
  return (
    <dialog
      ref={ref}
      className={styles["character-create-dialog"]}
      aria-label="新しいキャラクターを作る"
      onClose={onClose}
      onClick={onDialogClick}
    >
      <VStack element="div" gap="xl" align="stretch" justify="start" wrap="nowrap" className="">
        <Heading
          level={2}
          size="heading"
          tone="inherit"
          weight="bold"
          className={styles["character-create-heading"] ?? ""}
        >
          新しいキャラクター
        </Heading>
        <div className={styles["character-create-grid"]}>
          <PortraitDrop drop={form.portrait} />
          <div className={styles["character-create-fields"]}>
            <div className={styles["character-create-field"]}>
              <label className={styles["character-create-label"]} htmlFor="character-create-name">
                名前
              </label>
              <input
                id="character-create-name"
                type="text"
                className={styles["character-create-input"]}
                value={form.name}
                onChange={(event) => form.onNameChange(event.target.value)}
              />
              <Text element="span" size="label" tone="ink-quiet" weight="inherit" className="">
                {form.nameHint}
              </Text>
            </div>
            <div className={styles["character-create-field"]}>
              <label className={styles["character-create-label"]} htmlFor="character-create-id">
                id
              </label>
              <input
                id="character-create-id"
                type="text"
                className={`${styles["character-create-input"]} ${styles["character-create-input-mono"]}`}
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
                  className={styles["character-screen-note"] ?? ""}
                >
                  {form.idNote.text}
                </Text>
              )}
            </div>
            <div className={styles["character-create-field"]}>
              <span className={styles["character-create-label"]}>画面の差し色</span>
              <div className={styles["character-swatches-screen"]}>
                <AccentSwatch swatch={form.workAccent} disabled={false} />
                <AccentSwatch swatch={form.chatAccent} disabled={false} />
              </div>
            </div>
          </div>
        </div>
        <div className={styles["character-create-footer"]}>
          <Text element="span" size="label" tone="ink-quiet" weight="inherit" className="">
            背景と立ち絵の差し色は、作ったあとに設定できます
          </Text>
          <div className={styles["character-create-footer-spacer"]} />
          <Button
            type="button"
            variant="outline"
            size="secondary"
            pressed="none"
            disabled={false}
            ariaLabel={undefined}
            ariaHasPopup={undefined}
            title={undefined}
            className={styles["character-button-outline"] ?? ""}
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
            ariaHasPopup={undefined}
            title={undefined}
            className={styles["character-create-submit"] ?? ""}
            onClick={form.onSubmit}
          >
            <Text element="span" size="inherit" tone="inherit" weight="bold" className="">
              作る
            </Text>
          </Button>
        </div>
      </VStack>
    </dialog>
  )
}
