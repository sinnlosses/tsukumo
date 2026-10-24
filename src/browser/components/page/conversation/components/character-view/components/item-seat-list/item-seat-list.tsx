// キャラビューの3つの席に置いたアイテム。飾りなので読み上げず、押せない。
// 左下・右下は立ち絵を基準に置くので、立ち絵が無いときは出さない。

import type { ReactElement } from "react"

import type { ItemInfo, ItemSeatMap, SeatKey } from "../../../../../../../../shared/item/item.ts"
import styles from "./item-seat-list.module.css"

type ItemSeatsProps = {
  readonly seats: ItemSeatMap
  readonly portraitShown: boolean
}

const SEATS_BELOW_PORTRAIT: readonly SeatKey[] = ["belowLeft", "belowRight"]

export function ItemSeats({ seats, portraitShown }: ItemSeatsProps): ReactElement {
  return (
    <div className={styles["item-seats"]}>
      <Seat seat="topLeft" item={seats.topLeft} />
      {portraitShown &&
        SEATS_BELOW_PORTRAIT.map((seat) => <Seat key={seat} seat={seat} item={seats[seat]} />)}
    </div>
  )
}

function Seat({
  seat,
  item,
}: {
  readonly seat: SeatKey
  readonly item: ItemInfo | undefined
}): ReactElement | undefined {
  if (item === undefined) {
    return undefined
  }
  return (
    <img className={styles["seat"]} data-seat={seat} src={item.url} alt="" aria-hidden="true" />
  )
}
