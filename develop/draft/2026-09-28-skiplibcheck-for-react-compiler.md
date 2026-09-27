# React Compiler を入れるために本体の tsconfig に skipLibCheck を足した（振り返り: T-688）

- 札: 赤 道具（1回目）
- 根拠: `babel-plugin-react-compiler@1.0.0` と `@rolldown/plugin-babel@0.2.4` の型定義が、`@babel/core` を 7 系にしても 8 系にしても食い違う。委譲先は `tsconfig.json` に `skipLibCheck: true` を足して通した（`tsconfig.storybook.json` には前からある）。これで `src/**/*.d.ts`（自前の4ファイル）も型検査から外れる
- 出し先: skipLibCheck を残すか、人が決める。残さないなら、型の食い違いが直った版が出るまで待つタスク、または自前の `.d.ts` を `.ts` の型宣言に移して skipLibCheck の影響を無くすタスクにする
