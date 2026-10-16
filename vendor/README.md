# vendor/

three.js r186.1 の ES module ビルドをそのまま同梱しています（CDNに依存せず、
テレビ接続中の読み込み待ちや通信断で遊べなくなるのを避けるため）。

- `three.module.min.js` — jsDelivr 配布の `three@0.186.1/build/three.module.min.js`
- `three.core.js` — 同 `three@0.186.1/build/three.core.min.js` を改名したもの

**改名している理由**：`three.module.min.js` の中に `from "./three.core.js"` という
相対importが埋め込まれているため、ファイル名をこの綴りに合わせる必要があります。
中身は無改変の公式ビルド（minified）です。

three.js のライセンスは MIT です。
