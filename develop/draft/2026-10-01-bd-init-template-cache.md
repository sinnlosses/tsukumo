# Beads を使う adapter のテストで、bd init 済みの雛形を実行をまたいで使い回す（振り返り: GH-218）

- 札: 黄 正典の不備（1回目）
- 根拠: GH-218 で task-summary は 23.2秒 → 13.2秒（bd init を1ファイル1回にまとめた）で半分（11.6秒）に届かず、main-history は 14.5秒のまま。残りは `bd init` 約3.9秒/ファイルと、`bd` 1回 0.3〜0.5秒の呼び出し（組み込み Dolt の排他で並列にできない）。`globalSetup` で雛形を作る案は、Beads を使わない1ファイルの実行（0.39秒）にも約3.9秒を乗せるので採らなかった。`bd create --graph` は ID と status を指定できず束ねられない
- 出し先: タスクにするなら「`bd init` 済みの雛形を `bd` のバージョンをキーに一時ディレクトリへ置き、`test/fixture/beads-repository.ts` が初回だけ作って以降は複製する。task-summary・main-history を半分以下にする」。実行をまたぐ状態をホストに残してよいかは人の判断
