#!/usr/bin/env node
/**
 * 把插件发布成 npm 上的官方镜像包 `@lzqzm/dsh-project-panel`。
 *
 * 为什么要单独一个脚本：
 *   npm 上的裸名 `dsh-project-panel` 属于别人的账号（2026-10-27 发布 0.1.1），
 *   我们既发不了同名、也覆盖不了。同时市场 / GitHub Release 那条路必须保持
 *   包名 `dsh-project-panel`（cordis.patch.yml 里的 bundle id 和已装用户的
 *   升级路径都依赖它）。
 *
 *   所以这里从 `npm pack` 的产物解出一份临时副本，只改两处：
 *     - package.json 的 name  → @lzqzm/dsh-project-panel
 *     - cordis.patch.yml 的 id / name → 同一个 scope 名
 *   再发到 npm。源仓库、tag、Release 资产一律不动。
 *
 * 用法：
 *   node scripts/publish-npm.mjs [--dry-run] [--otp 123456]
 *
 * 前置：npm 已登录（npm login --registry=https://registry.npmjs.org），
 *       账号要有 @lzqzm 这个 scope（npm 用户名 lzqzm 自带同名 scope）。
 *       账号开了 2FA 时，发布需要带 30 秒有效的 --otp 验证码。
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { accessSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const NPM_NAME = '@lzqzm/dsh-project-panel';
const REGISTRY = 'https://registry.npmjs.org';
const ROOT = resolve(process.argv[1], '../..');
const dryRun = process.argv.includes('--dry-run');
const otpIndex = process.argv.indexOf('--otp');
const otp = otpIndex >= 0 ? (process.argv[otpIndex + 1] ?? '') : '';

function run(cmd, args, opts = {}) {
	return execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', ...opts });
}

/**
 * 直接跑 npm 的 JS 入口，避免 spawn(npm, args, { shell: true }) 在 Node 24 上
 * 报 DEP0190（参数不转义警告）。找不到入口才退回命令行。
 */
function npmCli() {
	const cli = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
	try {
		accessSync(cli);
		return cli;
	} catch {
		return '';
	}
}

function runNpm(args, opts = {}) {
	const cli = npmCli();
	if (cli) return execFileSync(process.execPath, [cli, ...args], { cwd: ROOT, encoding: 'utf8', ...opts });
	return execFileSync('npm', args, { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32', ...opts });
}

function fail(message) {
	console.error('✖ ' + message);
	process.exit(1);
}

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const version = pkg.version;
console.log(`📦 源包 ${pkg.name}@${version} → npm ${NPM_NAME}@${version}${dryRun ? '（dry-run）' : ''}`);

// 1. npm pack 出一份「和 Release 资产完全一致」的 tarball
const work = mkdtempSync(join(tmpdir(), 'dsh-npm-'));
try {
	const packOut = runNpm(['pack', '--pack-destination', work]).trim().split(/\r?\n/).pop();
	const tgz = join(work, packOut);
	console.log('  打包产物: ' + tgz);

	// 2. 解开到 work/package/
	run('tar', ['-xzf', tgz, '-C', work]);
	const dir = join(work, 'package');
	const files = readdirSync(dir);
	if (files.length < 5) fail('解包后目录不像一个包：' + files.join(', '));

	// 3. 只改包名与 bundle patch 里的 id / name
	const distPkgPath = join(dir, 'package.json');
	const distPkg = JSON.parse(readFileSync(distPkgPath, 'utf8'));
	distPkg.name = NPM_NAME;
	distPkg.publishConfig = { access: 'public' };
	writeFileSync(distPkgPath, JSON.stringify(distPkg, null, '\t') + '\n', 'utf8');

	const patchPath = join(dir, 'cordis.patch.yml');
	const patch = readFileSync(patchPath, 'utf8');
	const patched = patch
		.replace(/^([ \t]*(?:- )?)id:[ \t]*dsh-project-panel[ \t]*$/m, `$1id: '${NPM_NAME}'`)
		.replace(/^([ \t]*(?:- )?)name:[ \t]*'dsh-project-panel'[ \t]*$/m, `$1name: '${NPM_NAME}'`);
	if (patched === patch) fail('cordis.patch.yml 里没找到要改的 id / name —— 改法变了？');
	writeFileSync(patchPath, patched, 'utf8');
	console.log('  改名完成: package.json / cordis.patch.yml');

	if (dryRun) {
		console.log('  [dry-run] 解包目录: ' + dir);
		console.log('  [dry-run] package.json name = ' + distPkg.name);
		console.log('  [dry-run] patch:\n' + patched.trim());
		process.exit(0);
	}

	// 4. 登录检查
	const who = runNpm(['whoami', '--registry', REGISTRY]).trim();
	console.log('  npm 登录账号: ' + who);
	if (who !== 'lzqzm') {
		fail(`当前登录的是 ${who}，但包 scope 是 @lzqzm —— 请用 lzqzm 账号登录（npm login --registry=${REGISTRY}）`);
	}

	// 5. 同版本已存在就跳过（npm 不允许覆盖已发布版本）
	try {
		const existing = runNpm(['view', `${NPM_NAME}@${version}`, 'version', '--registry', REGISTRY], { stdio: ['ignore', 'pipe', 'ignore'] }).trim();
		if (existing === version) {
			console.log(`✔ npm 上已有 ${NPM_NAME}@${version}，跳过发布`);
			process.exit(0);
		}
	} catch {
		// 包或版本不存在，继续发布
	}

	// 6. 发布（账号开了 2FA 时带 --otp <6 位验证码>；用安全密钥则 npm 会打开浏览器）
	const publishArgs = ['publish', dir, '--registry', REGISTRY, '--access', 'public'];
	if (otp) publishArgs.push('--otp', otp);
	const npmEntry = npmCli();
	const published = npmEntry
		? spawnSync(process.execPath, [npmEntry, ...publishArgs], { cwd: ROOT, stdio: 'inherit' })
		: spawnSync('npm', publishArgs, { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
	if (published.status !== 0) {
		fail('npm publish 失败 —— 若是 2FA 拦截，加 --otp <验证码> 重跑：npm run publish:npm -- --otp 123456');
	}
	console.log(`✔ 已发布 https://www.npmjs.com/package/${NPM_NAME}`);
} finally {
	// dry-run 保留解包目录，方便人工核对；正式发布后清掉
	if (!dryRun) {
		try {
			rmSync(work, { recursive: true, force: true });
		} catch {
			// 临时目录删不掉不影响发布结果
		}
	}
}
