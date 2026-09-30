# `python3 <スクリプトのファイル>` での作業ツリーの書き換えも `deny-sed-in-place` で止める（振り返り: GH-149）

- 札: 黄 制約違反（7回目）
- 根拠: GH-149 の委譲先が、`cat >` でスクラッチに `split.py` を書き、`python3 split.py` で `src/server/session-driver/core/session-driver.ts` を `open(p, 'w')` で書き換えた。hook は heredoc と `-c` の中しか見ないので通った（委譲先の friction log に「黄 制約違反: hook をすり抜けた」と自己申告）。同じ回の heredoc の `open(p, 'w')` は GH-137 の判定で止まっており、ファイルに逃がす形だけが穴として残っている
- 出し先: 仕組みで塞ぐタスク1件。`scripts/deny-sed-in-place.ts` で、実行される `python3 <path>.py` の `<path>` が読めるファイルなら中身を読み、heredoc・`-c` と同じ `isDeniedPythonCode` にかける（読めなければ今までどおり通す）。`test/scripts/deny-sed-in-place.test.ts` に、作業ツリーの中へ書くスクリプトのファイルを止める行と、外へのリテラルの絶対パスなら通す行を足す
