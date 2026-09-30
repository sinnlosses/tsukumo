# 作業ツリーの中で打った `tsukumo` が、link 元の別の checkout を起こさないようにする（振り返り: GH-143）

- 札: 黄 道具（8回目）
- 根拠: GH-143 の実物の確認で、委譲先が作業ツリー（tsukumo-2）の中で `tsukumo` を打ったところ、`pnpm link --global` の先の `~/ghq/github.com/sinnlosses/tsukumo` が起き、作業ツリーの変更が載らない画面（版が合わないエラー）になった。`ps aux` で実体を突き止め、`node ./bin/tsukumo` で起こし直して解決した（委譲先の friction log）。`docs/workflow.md`「`loopable` の判定」の「直した作業ツリーで起こす」は、`tsukumo` コマンドがどこを指すかまでは書いていない
- 出し先: `bin/tsukumo` の起動の頭で、cwd が tsukumo のリポジトリ（の作業ツリー）で、かつ自分の置き場所と違うときは、cwd の作業ツリーの `bin/tsukumo` に委ねる（無ければ食い違いを出して止める）仕組みにするタスク。同じ札が8回目なので、正典への追記ではなく起動側で塞ぐ
