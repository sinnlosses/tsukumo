// 詳しい設定の最上段、選んでいるパックの名乗り（docs/screen-design.md 13.6）。大きな丸い顔・
// 名前・`id: <パックの名前>`・「使用中」の札・ひとこと、変えられないパックならその理由の一言。
// 右端には変えられるパックにだけ「名前とプロフィールを変える」（`character-profile-edit.tsx`）、
// 使用中以外のパックにはさらに「このキャラクターに切り替える」を置く。出し分けは
// `hooks/use-character-edit.ts` が畳んだ値のとおりで、判定を持たない。

import { type ReactElement } from "react"

import { Button } from "../../../../../../ui/button/button.tsx"
import { HStack } from "../../../../../../ui/h-stack/h-stack.tsx"
import { Heading } from "../../../../../../ui/heading/heading.tsx"
import { Text } from "../../../../../../ui/text/text.tsx"
import { VStack } from "../../../../../../ui/v-stack/v-stack.tsx"
import styles from "../../../../character.module.css"
import { SwitchIcon } from "../../../action-icon/action-icon.tsx"
import { type CharacterProfileModel } from "../../../hooks/use-character-edit.ts"
import { CharacterProfileEdit } from "../character-profile-edit/character-profile-edit.tsx"

export function CharacterProfile(props: { readonly profile: CharacterProfileModel }): ReactElement {
  const { profile } = props

  return (
    <div className={styles["character-profile"]}>
      {profile.face.kind === "shown" ? (
        <img className={styles["character-profile-face"]} src={profile.face.url} alt="" />
      ) : (
        <span className={styles["character-profile-face-blank"]} />
      )}
      <VStack
        element="div"
        name={{ kind: "none" }}
        ref={undefined}
        gap="xs"
        align="stretch"
        justify="start"
        wrap="nowrap"
        className={styles["character-profile-text"] ?? ""}
      >
        <div className={styles["character-profile-headline"]}>
          <Heading
            level={1}
            size="heading"
            tone="inherit"
            weight="bold"
            className={styles["character-profile-name"] ?? ""}
          >
            {profile.name}
          </Heading>
          <Text
            element="span"
            size="action"
            tone="ink-quiet"
            weight="inherit"
            className={styles["character-profile-id"] ?? ""}
          >
            id: {profile.id}
          </Text>
          {profile.inUse ? <span className={styles["character-in-use"]}>使用中</span> : null}
        </div>
        {profile.tagline.kind === "shown" ? (
          <Text element="span" size="secondary" tone="ink-quiet" weight="inherit" className="">
            {profile.tagline.text}
          </Text>
        ) : null}
        {profile.note.kind === "shown" ? (
          <Text
            element="span"
            size="label"
            tone="ink-quiet"
            weight="inherit"
            className={styles["character-screen-note"] ?? ""}
          >
            {profile.note.text}
          </Text>
        ) : null}
      </VStack>
      {profile.editProfile.kind === "shown" || profile.switchTo.kind === "shown" ? (
        <HStack
          element="div"
          name={{ kind: "none" }}
          ref={undefined}
          gap="sm"
          align="center"
          justify="start"
          wrap="wrap"
          className={styles["character-profile-actions"] ?? ""}
        >
          <CharacterProfileEdit edit={profile.editProfile} />
          {profile.switchTo.kind === "shown" ? (
            <Button
              type="button"
              variant="outline"
              size="secondary"
              pressed="none"
              disabled={profile.switchTo.disabled}
              ariaLabel={undefined}
              ariaHasPopup={undefined}
              title={profile.switchTo.title}
              className={styles["character-button-outline"] ?? ""}
              onClick={profile.switchTo.onSwitch}
            >
              <SwitchIcon />
              このキャラクターに切り替える
            </Button>
          ) : null}
        </HStack>
      ) : null}
    </div>
  )
}
