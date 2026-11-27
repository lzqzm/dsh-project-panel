#!/usr/bin/env node
/**
 * 发一个 GitHub Release —— 这就是「发布到插件市场」的全部动作。
 *
 * 市场（awesome-dsh-plugin.com）不读 npm：它的条目把安装地址写成
 *   https://github.com/lzqzm/dsh-project-panel/releases/latest/download/dsh-project-panel.tgz
 * 并定时抓本仓库「最新 release」的 tag / body。所以：**发 release = 上新版本**，
 * 不需要 npm publish，也不需要改市场索引。资产名必须正好是 dsh-project-panel.tgz。
 *
 * 用法：
 *   node scripts/publish-release.mjs [--notes <发布说明.md>] [--dry-run]
 *
 * 前置：版本号已在 package.json 里改好；改动已提交；tag `v<version>` 已 push
 * （脚本会检查远端有没有这个 tag，没有就拒绝发布 —— 免得市场里点进去 404）。
 *
 * 凭据：用本机 Git Credential Manager 里已存的 GitHub 账号（`git credential fill`），
 * 不发 PAT、不打印 token、不落盘。需要该账号对仓库有写权限。
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, renameSync, rmSync, statSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const REPO = "lzqzm/dsh-project-panel";
const ASSET_NAME = "dsh-project-panel.tgz";
const ROOT = resolve(process.argv[1], "../..");

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const notesIndex = argv.indexOf("--notes");
const notesFile = notesIndex >= 0 ? argv[notesIndex + 1] : "";

function fail(message) {
	console.error("✖ " + message);
	process.exit(1);
}

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const version = pkg.version;
const tag = "v" + version;
console.log("准备发布 " + pkg.name + "@" + version + "（tag " + tag + "）");

/* 远端必须已经有这个 tag：市场页面和 tarball 都挂 tag，缺了会 404。 */
const remoteTags = execFileSync("git", ["ls-remote", "--tags", "origin", "refs/tags/" + tag], { cwd: ROOT, encoding: "utf8" });
if (remoteTags.trim() === "") {
	fail("远端没有 tag " + tag + "：先在本地 `git tag " + tag + "`，再 `git push origin main --tags`");
}

/* 工作区脏不脏只提示：要发的包是 tag 上的代码，不是当前目录的草稿。 */
const dirty = execFileSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" }).trim();
if (dirty !== "") {
	console.warn("⚠ 工作区有未提交改动，打出来的包会包含它们：\n" + dirty);
}

function githubToken() {
	let out;
	try {
		out = execFileSync("git", ["credential", "fill"], {
			input: "protocol=https\nhost=github.com\n\n",
			encoding: "utf8"
		});
	} catch (error) {
		fail("读不到 GitHub 凭据（git credential fill 失败）：" + error.message);
	}
	const match = out.match(/^password=(.+)$/m);
	if (match === null) fail("git credential fill 没返回 password");
	return match[1].trim();
}

const headers = {
	authorization: "Bearer " + (dryRun ? "dry-run" : githubToken()),
	accept: "application/vnd.github+json",
	"user-agent": "dsh-project-panel-publish",
	"x-github-api-version": "2022-11-28"
};

/* 重复发布会把已有资产顶掉，先挡住（--dry-run 只打包，不碰 API）。 */
if (!dryRun) {
	const existing = await fetch("https://api.github.com/repos/" + REPO + "/releases/tags/" + tag, { headers });
	if (existing.ok) {
		const info = await existing.json();
		fail(tag + " 的 release 已经存在：" + info.html_url + "（要改说明就去网页改，别重发）");
	}
}

const body = notesFile === "" ? "## " + version + "\n\n详见 NOTES.md。" : readFileSync(resolve(notesFile), "utf8");

const work = mkdtempSync(join(tmpdir(), "dsh-release-"));
try {
	/* npm pack 的产物名是 <name>-<version>.tgz，市场要的是固定名 dsh-project-panel.tgz。 */
	const npmEntry = join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
	const npmReady = existsSync(npmEntry);
	const pack = spawnSync(
		npmReady ? process.execPath : process.platform === "win32" ? "npm.cmd" : "npm",
		npmReady ? [npmEntry, "pack", "--pack-destination", work] : ["pack", "--pack-destination", work],
		{
			cwd: ROOT,
			encoding: "utf8",
			shell: npmReady ? false : process.platform === "win32"
		}
	);
	if (pack.status !== 0) fail("npm pack 失败：" + (pack.stderr || pack.stdout || "").slice(-500));
	const packed = pack.stdout.trim().split(/\r?\n/).filter((line) => line.endsWith(".tgz")).pop();
	if (packed === undefined) fail("没认出 npm pack 的产物名：" + pack.stdout);
	const assetPath = join(work, ASSET_NAME);
	renameSync(join(work, packed), assetPath);
	const bytes = readFileSync(assetPath);
	console.log("打包完成：" + ASSET_NAME + " " + statSync(assetPath).size + " bytes");

	if (dryRun) {
		console.log("（--dry-run：只打包，不发 API）");
		process.exit(0);
	}

	const created = await fetch("https://api.github.com/repos/" + REPO + "/releases", {
		method: "POST",
		headers: Object.assign({ "content-type": "application/json" }, headers),
		body: JSON.stringify({ tag_name: tag, name: version, body, draft: false, prerelease: false, target_commitish: "main" })
	});
	const release = await created.json();
	if (!created.ok) fail("建 release 失败 " + created.status + "：" + JSON.stringify(release).slice(0, 300));
	console.log("release 已建：" + release.html_url);

	const uploaded = await fetch(
		"https://uploads.github.com/repos/" + REPO + "/releases/" + release.id + "/assets?name=" + encodeURIComponent(ASSET_NAME),
		{
			method: "POST",
			headers: Object.assign({ "content-type": "application/octet-stream", "content-length": String(bytes.length) }, headers),
			body: bytes
		}
	);
	const asset = await uploaded.json();
	if (!uploaded.ok) fail("上传资产失败 " + uploaded.status + "：" + JSON.stringify(asset).slice(0, 300));
	console.log("资产已上传：" + asset.name + " " + asset.size + " bytes");
	console.log("市场安装地址（现在就指向新版）：");
	console.log("  dsh plugin --profile web add -w \"https://github.com/" + REPO + "/releases/latest/download/" + ASSET_NAME + "\"");
	console.log("市场卡片文案由 awesome-dsh-plugin.com 定时抓取，通常一天内刷新。");
} finally {
	rmSync(work, { recursive: true, force: true });
}
