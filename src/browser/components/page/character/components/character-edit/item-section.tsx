// キャラクター画面の「アイテム」の区画。
// 上に3つの席（このキャラクターのもの。一覧から選んで置く）、下に一覧（全キャラクター共通。足す・消す）。

import type { ReactElement } from "react"

import { Button } from "../../../../ui/button/button.tsx"
import { Heading } from "../../../../ui/heading/heading.tsx"
import { PlusIcon, TrashIcon } from "../../../../ui/icon/icon.tsx"
import { Select } from "../../../../ui/select/select.tsx"
import { Text } from "../../../../ui/text/text.tsx"
import { VStack } from "../../../../ui/v-stack/v-stack.tsx"
import { ITEM_LEAD, SEAT_EMPTY_OPTION } from "../../domain/character-edit-copy.ts"
import type { ItemSectionModel, SeatPickModel } from "../../domain/item-edit-model.ts"
import styles from "./character-edit.module.css"
import { ItemAddDialog } from "./item-add-dialog.tsx"
import { ItemRemoveConfirm } from "./item-remove-confirm.tsx"

export function ItemSection(props: { readonly section: ItemSectionModel }): ReactElement {
  const { section } = props

  return (
    <VStack
      element="section"
      name={{ kind: "labelledby", id: "character-items" }}
      gap="md"
      align="stretch"
      justify="start"
      wrap="nowrap"
      className=""
    >
      <Heading level={2} size="body" tone="inherit" weight="bold" className="">
        <span id="character-items">アイテム</span>
      </Heading>
      <Text element="p" size="secondary" tone="ink-quiet" weight="inherit" className="">
        {ITEM_LEAD}
      </Text>
      <div className={styles["item-seats"]}>
        {section.seats.map((seat) => (
          <SeatCard key={seat.seat} seat={seat} />
        ))}
      </div>
      <ul className={styles["item-grid"]} aria-label="アイテムの一覧">
        {section.items.map((item) => (
          <li key={item.id} className={styles["item-card"]} data-item={item.id}>
            <img className={styles["item-card-thumb"]} src={item.url} alt="" />
            <span className={styles["item-card-name"]}>{item.name}</span>
            <span className={styles["item-card-actions"]}>
              <Button
                variant="outline-soft-danger"
                size="secondary"
                pressed="none"
                disabled={false}
                ariaLabel={`${item.name}を消す`}
                disclosure={{ kind: "none" }}
                className={styles["item-card-remove"]}
                onClick={item.onRemove}
              >
                <TrashIcon />
              </Button>
            </span>
          </li>
        ))}
        <li className={styles["item-add-cell"]}>
          <Button
            variant="outline-dashed"
            size="secondary"
            pressed="none"
            disabled={section.add.disabled}
            disclosure={{ kind: "none" }}
            title={section.add.title}
            className={styles["item-add"]}
            onClick={section.add.onOpen}
          >
            <PlusIcon />
            アイテムを足す
          </Button>
        </li>
      </ul>
      {section.addDialog.kind === "open" && <ItemAddDialog dialog={section.addDialog} />}
      {section.removeConfirm.kind === "open" && (
        <ItemRemoveConfirm confirm={section.removeConfirm} />
      )}
    </VStack>
  )
}

function SeatCard(props: { readonly seat: SeatPickModel }): ReactElement {
  const { seat } = props
  const selectId = `character-seat-${seat.seat}`

  return (
    <div className={styles["item-seat"]} data-seat={seat.seat}>
      {seat.current === undefined ? (
        <span className={styles["item-seat-blank"]} />
      ) : (
        <img className={styles["item-seat-thumb"]} src={seat.current.url} alt="" />
      )}
      <label htmlFor={selectId} className={styles["item-seat-label"]}>
        {seat.label}
      </label>
      <Select
        id={selectId}
        ariaLabel={`${seat.label}に置くアイテム`}
        frameClassName={styles["item-seat-select-frame"]}
        className={styles["item-seat-select"]}
        value={seat.current?.id ?? ""}
        options={[
          { value: "", label: SEAT_EMPTY_OPTION },
          ...seat.options.map((option) => ({ value: option.id, label: option.name })),
        ]}
        disabled={false}
        onChange={seat.onPick}
      />
    </div>
  )
}
