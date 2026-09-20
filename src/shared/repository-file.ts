// 作業ディレクトリの git 管理下のファイル一覧を配る経路の名前と、届いた一覧の読み取り。
// **サーバ（`src/server/adapter/server.ts` が配る）とブラウザ（入力欄の `@` 補完が取りに行く）の両方が
// 同じ値を見る**ので、shared に置く（`session-socket.ts` と同じ考え方。ここは値だけで
// `node:` にも `document` にも触らない）。
//
// **運ぶのはリポジトリ相対のパスだけで、ファイルの中身は運ばない。**
// どのファイルが git 管理下かを知るのは外の世界に触る仕事なので `src/server/adapter/repository-file.ts`
// が持つ（原則2・原則3）。
//
// **起動トークンが要る経路**（`SESSION_TOKEN_QUERY_NAME` を `/ws` と同じ形で付ける）。配るのは
// 利用者の作業ディレクトリの中身なので、同梱物や素材と違って誰にでも配ってよい静的な物ではない。

/** ファイル一覧の経路（`GET /repository-file?t=<起動トークン>`）。 */
export const REPOSITORY_FILE_PATH = "/repository-file"

/**
 * 届いた JSON を一覧として読む。**読めない形のときは空**（候補を出さないだけで、呼び出し側は
 * 落ちない）。文字列でない要素はその要素だけ捨てる。
 */
export function readRepositoryFileList(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter((entry): entry is string => typeof entry === "string")
}
