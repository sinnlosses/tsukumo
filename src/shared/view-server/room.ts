// 部屋の名前。ビューのポート1つ＝部屋1つで、同じディレクトリで tsukumo を何個も起こすとポートがずれ、別の部屋になる。
//
// 印（セッションの目印）はポート番号のままで、名前は画面のためだけのもの。
// 名前を鍵に使わないので、語彙を入れ替えても過去のセッションは迷子にならない。
//
// 部屋はキャラクターを入れ替えても変わらない「起こした場所」で、キャラクターの持ち物ではないのでコード側に置く。

/**
 * 部屋の名前に使う色の名前。
 * 並び順がそのままポートの並び（先頭が {@link FIRST_ROOM_PORT}）で、ポートの繰り上げ（塞がっていたら +1）と同じ向きに進む。
 * 13個めからは名前が尽きるので、{@link roomName} がポート番号をそのまま名乗る。
 */
const ROOM_COLORS = [
  "空色",
  "若葉",
  "菜の花",
  "夕焼け",
  "藍",
  "藤",
  "朱",
  "灰",
  "若草",
  "海",
  "桜",
  "墨",
] satisfies readonly string[]

/**
 * 語彙の1つめが載るポート。`DEFAULT_VIEW_PORT` と同じ値に揃える。
 * `shared` からサーバ側を import できないので写してある（ずれたらテストが落ちる）。
 */
export const FIRST_ROOM_PORT = 7327

/** 部屋の名前の結び（「空色」＋これ）。 */
const ROOM_SUFFIX = "の間"

/**
 * ビューのポートに割り当たった部屋の名前。
 * 語彙の外のポート（13個め以降・`TSUKUMO_VIEW_PORT` で遠い番号を指したとき・OS まかせの `0`）はポート番号をそのまま名乗る。
 */
export function roomName(viewPort: number): string {
  const color = ROOM_COLORS[viewPort - FIRST_ROOM_PORT]
  return color === undefined ? String(viewPort) : `${color}${ROOM_SUFFIX}`
}
