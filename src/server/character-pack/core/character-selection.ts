// どのキャラクターパックを出すかの判断だけ。ここは渡された一覧を名前で引くだけで、パックの中身も一覧の作り方も知らない。
//
// 名前で引くのは、名前をパスとして組み立てないため。一覧に無い名前は必ず既定へ落ちる。

/** 名前で選べるもの。選ぶのに要る一片だけを見る。 */
export type NamedCharacterPack = { readonly name: string }

/**
 * これから起こすパックの決め方。
 * 「画面から選ばれた名前」と「起こし直しに使ういま出しているパック」を1つの欄で兼ねると、モードを切り替えただけの起こし直しでも覚えた値が書き換わる。
 */
export type CharacterSelection =
  /** 起動時の初期パック（順位は {@link selectInitialCharacterPack}）。 */
  | { readonly by: "initial" }
  /** 画面から選ばれた名前。覚えるのはこれだけ（`writeRememberedCharacter`）。 */
  | { readonly by: "name"; readonly name: string }
  /** いま出しているパックのまま起こし直す（モードの切り替え）。名前は運ばない。 */
  | { readonly by: "current" }

/** 起動時の初期パックを決めるのに要るもの。 */
export type InitialCharacterPackOptions<Pack extends NamedCharacterPack> = {
  /** いま選べるパックの一覧。 */
  readonly packs: readonly Pack[]
  /** どれにも当たらなかったときのパック（同梱の既定、または指定から読んだもの）。 */
  readonly fallback: Pack
  /**
   * その回の指定（`TSUKUMO_CHARACTER`）。値そのものは使わない。
   * 指定があるときはすでに `fallback` がそこから読まれているので、「あるか無いか」だけを見る。
   */
  readonly specified: string | undefined
  /** 前回に画面から選んで覚えたパックの名前を読む。 */
  readonly readRemembered: () => string | undefined
}

/**
 * 起動時の初期パック。優先順位は その回の指定（`TSUKUMO_CHARACTER`）> 覚えた値 > 同梱の既定。
 * 指定があるときは覚えた値を読みに行かない。
 * 覚えた値への書き込みはここの持ち分ではない（書くのは画面から選んだときだけ）。
 */
export function selectInitialCharacterPack<Pack extends NamedCharacterPack>(
  options: InitialCharacterPackOptions<Pack>,
): Pack {
  return options.specified === undefined
    ? selectCharacterPack(options.packs, options.fallback, options.readRemembered())
    : options.fallback
}

/**
 * 一覧から名前でパックを引く。知らない名前は既定へ落ちる。
 * 画面から届いた名前も、覚えた値も、一覧に無ければ同じ扱い。
 */
export function selectCharacterPack<Pack extends NamedCharacterPack>(
  packs: readonly Pack[],
  fallback: Pack,
  name: string | undefined,
): Pack {
  return packs.find((pack) => pack.name === name) ?? fallback
}
