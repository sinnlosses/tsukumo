// 起動時にレイアウトページのタブを自動で開くかどうかの設定。

// 起動時にレイアウトページのタブを自動で開くかどうか。既定は開く（コマンド1つで完成させるため）。
export const OPEN_VIEW_ENV_NAME = "TSUKUMO_OPEN_VIEW"

/**
 * 起動時にレイアウトページのタブを自動で開くかどうかを決める。**環境変数が読み取りの唯一の場所**
 * （docs/coding-standards.md「外部の入力を読む場所を1つにする」。実際の `process.env` の読み取りは
 * 呼び出し側の src/index.ts に残る）。"0" のときだけ開かない（ポート番号のような不正値の
 * 弾き方は不要で、それ以外の値はすべて「開く」に倒す）。
 */
export function resolveOpenView(rawValue: string | undefined): boolean {
  return rawValue?.trim() !== "0"
}
