# 疑似セッションでタスクの一覧・詳細を撮るときの課題の置き方を testing.md に書く（振り返り: GH-495）

- 観点: 黄 道案内
- 根拠: GH-495 の委譲先が、疑似セッションのタスクの一覧を `capture-view` で撮ったところ「不明」「読めない」の画しか撮れず、3枚を無駄にした。疑似セッションは cwd の `.tsukumo/fake-beads-issues.json` を読む（`src/server/repository/adapter/fake-beads.ts`）と分かってから、仮のファイルを置いて撮り直した。一覧の行を押す `--click` も `li:has-text("…")` の形まで当たらなかった（friction log の黄2件）
- 出し先: `docs/architecture/testing.md`「手で確かめること」に、タスクの一覧・詳細を撮るときは `.tsukumo/fake-beads-issues.json` に架空の課題を置く（撮ったら消す）ことと、一覧の行を押す `--click` の当たる形を1〜2行で足す。置き忘れで画が「不明」になるなら、同梱の架空の課題を場面として持たせるタスクにしてもよい
