#!/usr/bin/env node
/**
 * 把插件发布成 npm 上的官方镜像包 `@lzqm/dsh-project-panel`。
 *
 * 为什么要单独一个脚本：
 *   npm 上的裸名 `dsh-project-panel` 属于别人的账号（2026-10-27 发布 0.1.1），
 *   我们既发不了同名、也覆盖不了。同时市场 / GitHub Release 那条路必须保持
 *   包名 `dsh-project-panel`（cordis.patch.yml 里的 bundle id 和已装用户的
 *   升级路径都依赖它）。
 *
 *   所以这里从 `npm pack` 的产物解出一份临时副本，只改两处：
 *     - package.json 的 name  → @lzqm/dsh-project-panel
 *     - cordis.patch.yml 的 id / name → 同一个 scope 名
 *   再发到 npm。源仓库、tag、Release 资产一律不动。
 *
 * 用法：
 *   node scripts/publish-npm.mjs [--dry-run]
 *
 * 前置：npm 已登录（npm login --registry=https://registry.npmjs.org），
 *       账号要有 @lzqm 这个 scope（npm 用户名 lzqm 自带同名 scope）。
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const NPM_NAME = '@lzqm/dsh-project-panel';
const REGISTRY = 'https://registry.npmjs.org';
const ROOT = resolve(process.argv[1], '../..');
const dryRun = process.argv.includes('--dry-run');

function run(cmd, args, opts = {}) {
	return execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32', ...opts });
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
	const packOut = run('npm', ['pack', '--pack-destination', work]).trim().split(/\r?\n/).pop();
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
	const who = run('npm', ['whoami', '--registry', REGISTRY]).trim();
	console.log('  npm 登录账号: ' + who);
	if (who !== 'lzqm') {
		fail(`当前登录的是 ${who}，但包 scope 是 @lzqm —— 请用 lzqm 账号登录（npm login --registry=${REGISTRY}）`);
	}

	// 5. 同版本已存在就跳过（npm 不允许覆盖已发布版本）
	try {
		const existing = run('npm', ['view', `${NPM_NAME}@${version}`, 'version', '--registry', REGISTRY], { stdio: ['ignore', 'pipe', 'ignore'] }).trim();
		if (existing === version) {
			console.log(`✔ npm 上已有 ${NPM_NAME}@${version}，跳过发布`);
			process.exit(0);
		}
	} catch {
		// 包或版本不存在，继续发布
	}

	// 6. 发布
	run('npm', ['publish', dir, '--registry', REGISTRY, '--access', 'public'], { stdio: 'inherit' });
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
