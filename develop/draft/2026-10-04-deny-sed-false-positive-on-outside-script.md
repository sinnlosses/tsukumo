# `deny-sed-in-place.ts` が、作業ツリーの外の Python スクリプトを tsukumo を cwd にして走らせるだけの呼び出しを拒まないようにする（振り返り: GH-309）

- 札: 黄 道具（18回目）
- 根: deny-hook-false-positive
- 根拠: GH-309 の委譲先が、scratchpad に置いた claude-skills の作業ツリーの `selftest.py`（一時ディレクトリにだけ書く）を走らせたところ、tsukumo を cwd にしたときに2回拒まれた（`2>&1` を付けた形と、外してパイプだけにした形）。claude-skills の作業ツリーを cwd にすると通った。GH-293 で「作業ツリーの外のスクリプトは中身の書き込み先で判定する」にしたが、書き先が一時ディレクトリでも、組み立てたパスや cwd 相対の書き込みを持つスクリプトは作業ツリーの中とみなして拒んでいる。同じ回で、GH-297〜GH-310 の委譲先も Python での書き換えを拒まれて Edit に切り替えている（こちらは意図どおりの拒否）
- 出し先: 検査。`scripts/deny-sed-in-place.ts` の node・Python のスクリプトの判定で、「cwd と違う git の作業ツリーの中にあるスクリプト」をその作業ツリーの持ち物として読み、tsukumo の作業ツリーへの書き込みでなければ通す。誤って拒んだ形（scratchpad の別リポジトリの selftest を tsukumo を cwd にして走らせる）を `test/scripts/deny-sed-in-place.test.ts` の通す側に足し、GH-311 の拒否の記録（`node scripts/hook-denial-tally.ts`）で `python-write` の件数が減ったかを次の週ごとの振り返りで見る
