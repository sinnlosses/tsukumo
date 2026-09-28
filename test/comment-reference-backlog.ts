// コメントの指し方（docs/coding-standards.md「コメント」の「別の場所を指すとき」）に、まだ揃えていないファイル。
// 揃えたら一覧から外す（外し忘れは検査が落とす）。新しいファイルは載せない。
// 空になったら、このファイルと検査の側の読み込みを消す。
export const COMMENT_REFERENCE_BACKLOG = [] as const satisfies readonly string[]
