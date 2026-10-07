# Bash ツールの `ls <パス>` が eza のエイリアスに化けて引数を拒むのを、シェルの読み込み元で外す（振り返り: GH-454）

- 観点: 黄 道具の経済
- 根拠: GH-454 の委譲先が `ls <path>` で存在を確かめようとして `error: invalid value '<path>' for '--icons [<WHEN>]'` で拒まれ、`test -e` に打ち直した。同じセッションのメインも `ls -d develop/draft/`・`ls -d docs/history/direction.md` で同じ文言に2回当たった。Bash ツールが読み込むシェルのスナップショットに `ls` → `eza --icons` のエイリアスが入っていて、パスを `--icons` の値として読んでいる
- 出し先: 利用者のシェル設定（`~/.zshrc` などの `alias ls=…`）を、対話シェルのときだけ効くようにする（`[[ -o interactive ]]` の内側へ移す）か、エイリアスの `--icons` を `--icons=auto` にする。グローバル設定の書き換えなので、人が直す
