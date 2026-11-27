# scaffold/vendor —— 脚手架依赖兜底包

这个目录由 `node scripts/build-vendor.mjs` 生成，**不要手改**。

`deps.cjs` 是把 axios / archiver / form-data / unzipper 打在一起的一个 CJS 文件；
四个同名目录只是转发包，让 `NODE_PATH=<本目录>` 时 `require('axios')` 之类的调用能解析到。

为什么不用 node_modules：这四个包的传递依赖（readable-stream → string_decoder）会触发
DSH 的 generation peer validation，不能进 dependencies；拷一份 node_modules 又有 17MB。
