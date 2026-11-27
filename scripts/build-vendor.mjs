/**
 * build-vendor.mjs —— 给插件自带脚手架生成「依赖兜底包」。
 *
 * 背景：scaffold/ 里的 source-*.js 要 require axios / archiver / form-data / unzipper，
 * 但客户机器上往往没有 Node 工程、也没有 npm（桌面端内置的 Node 不带 npm），
 * 于是「装依赖」永远装不上。这里把四个包用 esbuild 打成**一个** 0.8MB 的 CJS 文件，
 * 随插件发布；脚本 require 不到时从它里面取。
 *
 * 产物（提交进仓库，不要 gitignore）：
 *   scaffold/vendor/deps.cjs                 —— bundle 本体
 *   scaffold/vendor/<name>/package.json      —— 4 个转发包，让 NODE_PATH 指过来就能 require
 *   scaffold/vendor/<name>/index.js
 *
 * 用法：node scripts/build-vendor.mjs
 * 改完 devDependencies 里这四个包的版本后重跑一次，把 scaffold/vendor 一起提交。
 */
import { mkdir, rm, writeFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const PANEL_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const VENDOR_DIR = join(PANEL_ROOT, "scaffold", "vendor");

/** 包名 → bundle 里对应的导出键 */
const SHIMS = {
	"axios": "axios",
	"archiver": "archiver",
	"unzipper": "unzipper",
	"form-data": "FormData",
};

const ENTRY = [
	`const FormData = require("form-data");`,
	`module.exports = {`,
	`\taxios: require("axios"),`,
	`\tarchiver: require("archiver"),`,
	`\tunzipper: require("unzipper"),`,
	`\tFormData,`,
	`\t"form-data": FormData,`,
	`};`,
].join("\n");

await rm(VENDOR_DIR, { recursive: true, force: true });
await mkdir(VENDOR_DIR, { recursive: true });

await esbuild.build({
	stdin: {
		contents: ENTRY,
		resolveDir: PANEL_ROOT,
		sourcefile: "scaffold-vendor-entry.cjs",
		loader: "js",
	},
	bundle: true,
	platform: "node",
	format: "cjs",
	target: "node22",
	minify: true,
	legalComments: "eof",
	outfile: join(VENDOR_DIR, "deps.cjs"),
	logLevel: "warning",
});

await writeFile(
	join(VENDOR_DIR, "README.md"),
	[
		"# scaffold/vendor —— 脚手架依赖兜底包",
		"",
		"这个目录由 `node scripts/build-vendor.mjs` 生成，**不要手改**。",
		"",
		"`deps.cjs` 是把 axios / archiver / form-data / unzipper 打在一起的一个 CJS 文件；",
		"四个同名目录只是转发包，让 `NODE_PATH=<本目录>` 时 `require('axios')` 之类的调用能解析到。",
		"",
		"为什么不用 node_modules：这四个包的传递依赖（readable-stream → string_decoder）会触发",
		"DSH 的 generation peer validation，不能进 dependencies；拷一份 node_modules 又有 17MB。",
	].join("\n") + "\n",
	"utf8",
);

for (const [pkg, key] of Object.entries(SHIMS)) {
	const dir = join(VENDOR_DIR, pkg);
	await mkdir(dir, { recursive: true });
	await writeFile(
		join(dir, "package.json"),
		JSON.stringify({ name: pkg, version: "0.0.0-dsh-vendor", private: true, main: "index.js" }, null, 2) + "\n",
		"utf8",
	);
	await writeFile(
		join(dir, "index.js"),
		`"use strict";\n// 由 scripts/build-vendor.mjs 生成：转发到同目录的依赖兜底包。\nmodule.exports = require("../deps.cjs")[${JSON.stringify(key)}];\n`,
		"utf8",
	);
}

const { size } = await stat(join(VENDOR_DIR, "deps.cjs"));
console.log(`scaffold/vendor/deps.cjs  ${(size / 1024 / 1024).toFixed(2)} MB`);
console.log(`转发包：${Object.keys(SHIMS).join(", ")}`);
