// 部屋の名前（`docs/glossary.md`「部屋」/ `docs/screen-design.md` 13.9）。**ビューのポート1つ＝部屋1つ**で、
// 同じディレクトリで tsukumo を何個も起こすとポートがずれ、別の部屋になる
// （`src/shared/session-choice.ts` の `viewPort`）。
//
// **印（セッションの目印）はポート番号のままで、名前は画面のためだけのもの**（`docs/screen-design.md` 13.9）。
// 名前を鍵に使わないので、語彙を入れ替えても過去のセッションは迷子にならない。
//
// **キャラクターの持ち物ではないのでコード側に置く**（`CLAUDE.md` 原則4 が「書かない」と言って
// いるのはキャラクターの中身で、部屋はキャラクターを入れ替えても変わらない「起こした場所」の
// ほう）。
//
// **サーバとブラウザの両方が読める場所に置く**が、いま読むのはブラウザだけ（帯とサイドバー）。

/**
 * 部屋の名前に使う色の名前。**並び順がそのままポートの並び**（先頭が {@link FIRST_ROOM_PORT}）で、
 * `docs/requirements.md` 5 のポートの繰り上げ（塞がっていたら +1）と同じ向きに進む。
 *
 * 12個なのは、同じ手元で並べて起こす数がその程度に収まるため（ポートの繰り上げの上限は20個なので、
 * **13個めからは名前が尽きる**。そのときは {@link roomName} がポート番号をそのまま名乗る）。
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
 * 語彙の1つめが載るポート。**`src/server/core/port-resolution.ts` の `DEFAULT_VIEW_PORT` と
 * 同じ値**（`shared` からサーバ側を import できないので写してある。ずれたら
 * `test/shared/room.test.ts` が落ちる）。
 */
export const FIRST_ROOM_PORT = 7327

/** 部屋の名前の結び（「空色」＋これ）。 */
const ROOM_SUFFIX = "の間"

/**
 * ビューのポートに割り当たった部屋の名前。**語彙の外のポートはポート番号をそのまま名乗る**
 * （13個め以降・`TSUKUMO_VIEW_PORT` で遠い番号を指したとき・OS まかせの `0`）——
 * 名前が無いことより、どの番号の部屋かが分かるほうが役に立つため。
 */
export function roomName(viewPort: number): string {
  const color = ROOM_COLORS[viewPort - FIRST_ROOM_PORT]
  return color === undefined ? String(viewPort) : `${color}${ROOM_SUFFIX}`
}
