#!/usr/bin/env node
/**
 * utils.js - MagicalCoder LocalDev 公共工具模块
 *
 * 提供:
 * - 环境加载（.env）
 * - 登录和 Cookie 管理
 * - API 请求封装
 * - 文件压缩和解压
 * - 目录扫描
 * - UUID 生成
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const archiver = require('archiver');
const unzipper = require('unzipper');

/**
 * 加载 .env 文件（强制覆盖系统环境变量）
 */
function loadEnv() {
    const envFile = path.join(__dirname, '.env');
    if (fs.existsSync(envFile)) {
        // 去掉 BOM：用记事本「另存为 UTF-8」会在文件开头写上 EF BB BF，
        // 不剥掉的话第一个键会变成 "\uFEFFSERVER_URL"，永远匹配不上（表现和 CRLF 那个坑一样）。
        const envContent = fs.readFileSync(envFile, 'utf-8').replace(/^\uFEFF/, '');
        envContent.split('\n').forEach(line => {
            // 先 trim：.env 若是 CRLF 行尾，非多行模式下 (.*)$ 到不了行尾（JS 里 . 不匹配 \r），
            // 整行都匹配不上 —— 结果是所有变量读不到，登录退化成拿系统环境变量 USERNAME（当前账户名）去试。
            const match = line.trim().match(/^([^=]+)=(.*)$/);
            if (match) {
                const key = match[1].trim();
                const value = match[2].trim();
                // 强制覆盖环境变量
                process.env[key] = value;
            }
        });
    }
}

/**
 * 生成 UUID v4
 */
function generateUUID() {
    return crypto.randomUUID().replace(/-/g, '');
}

/**
 * 工程目录里的来源标记：记住这个目录是从哪台服务器上拉的。
 *
 * 项目 uuid 只在一台服务器内唯一。两台服务器上有同一个 uuid 的工程时，以前两边
 * 都落进 `<uuid>/`，后拉的直接盖掉先拉的，连 `.cookies` 都共用（会话还会串）。
 * 现在目录名按来源服务器区分，这个文件负责「认得出来」：同名冲突时靠它挑目录。
 */
const SOURCE_FILE = '.project-source.json';

/** 服务器地址 → 能当目录名用的短标识（`http://1.2.3.4:28080` → `1.2.3.4-28080`）。 */
function serverKey(serverUrl) {
    const raw = String(serverUrl || '').trim();
    if (raw === '') return '';
    const hostPort = raw.replace(/^[A-Za-z][A-Za-z0-9+.-]*:\/\//, '').split('/')[0];
    const dotted = hostPort.replace(/:(\d+)$/, '-$1');
    return dotted.replace(/[^A-Za-z0-9._-]/g, '_');
}

/** 读工程目录的来源标记；没有 / 坏了都当没有。 */
function readSource(dir) {
    const file = path.join(dir, SOURCE_FILE);
    if (!fs.existsSync(file)) return null;
    try {
        const info = JSON.parse(fs.readFileSync(file, 'utf-8'));
        if (info === null || typeof info !== 'object') return null;
        return info;
    } catch (e) {
        return null;
    }
}

/**
 * 写来源标记（合并已有键）。
 *
 * 内容没变就不落盘 —— 每个脚本都会调一次 resolveProjectDir，每次都重写文件
 * 会让 mtime 一直在动，推送账本会把它当成「刚改过」。
 */
function writeSource(dir, info) {
    const file = path.join(dir, SOURCE_FILE);
    const merged = Object.assign({}, readSource(dir) || {}, info);
    const text = JSON.stringify(merged, null, 2) + '\n';
    try {
        if (fs.existsSync(file) && fs.readFileSync(file, 'utf-8') === text) return merged;
    } catch (e) { /* 读不动就照写 */ }
    fs.writeFileSync(file, text, 'utf-8');
    return merged;
}

/**
 * 推送成功后在工作区根写一行「推送戳」：`.push-log.jsonl`。
 *
 * 为什么需要它：面板的推送账本原来只在「经由面板发起的运行」结束时刷新，
 * 而 AI 会话 / 手动在终端里跑 `node source-page-push.js …` 也能推送成功 ——
 * 面板不知道，于是那一片永远停在「待推送」。脚本自己留一行时间戳，面板扫描时
 * 拿它比对：单元里所有文件的 mtime 都不晚于这个戳，就说明「现在磁盘上的内容
 * 就是推上去的那一版」，直接算已推送；之后再改文件（mtime 变新）就又变回待推送。
 *
 * 只追加一行、几十字节，失败也不影响推送结果；点开头的文件，文件树里本来就隐藏。
 */
const PUSH_LOG = '.push-log.jsonl';

function appendPushMark(zone, absPath) {
    try {
        if (typeof absPath !== 'string' || absPath === '') return;
        const rel = path.relative(__dirname, absPath).split(path.sep).join('/');
        /*
            工作区外的目录不记：`..` 开头是上级，跨盘符时 path.relative 直接给绝对路径
            （`C:\Windows\...`），两种都要挡掉，免得写进别人的账。
        */
        if (rel === '' || rel === '.' || rel.startsWith('..') || path.isAbsolute(rel)) return;
        const line = JSON.stringify({ at: Date.now(), zone: String(zone || ''), dir: rel }) + '\n';
        fs.appendFileSync(path.join(__dirname, PUSH_LOG), line, 'utf-8');
        prunePushLog();
    } catch (e) { /* 记账失败不影响推送 */ }
}

/** 日志只留最近 30 天、最多 5000 行，免得无限增长。 */
function prunePushLog() {
    try {
        const file = path.join(__dirname, PUSH_LOG);
        const lines = fs.readFileSync(file, 'utf-8').split('\n').filter((item) => item.trim() !== '');
        const limit = Date.now() - 30 * 24 * 3600 * 1000;
        const kept = lines.filter((item) => {
            try {
                const one = JSON.parse(item);
                return typeof one.at === 'number' && one.at >= limit;
            } catch (e) { return false; }
        });
        if (kept.length === lines.length && kept.length <= 5000) return;
        fs.writeFileSync(file, kept.slice(-5000).join('\n') + '\n', 'utf-8');
    } catch (e) { /* 清理失败无所谓 */ }
}


/**
 * 决定这次的项目目录 —— 每台服务器一个文件夹，下面再按项目 uuid 分。
 *
 * 目录形如 `<工作区>/<主机-端口>/<项目 uuid>/`：
 *   1. 同一台服务器上的不同项目 → 各占一个 uuid 目录；
 *   2. 不同服务器上的同名 / 同 uuid 项目 → 各在自己的服务器文件夹里，永远不打架
 *      （老办法是给目录加 `@主机-端口` 后缀，一长串挤在根上，看不出谁是谁）。
 *
 * 老工作区（根下直接是 `<uuid>/` 或 `<uuid>@主机-端口/`）不用手工搬：下次拉取 / 推送
 * 走到这里时整个目录 rename 进 `<主机-端口>/`，`.project-source.json` 跟着一起走，
 * 来源标记和 `.cookies` 都不会丢。搬不动（被占用 / 没权限）就原地接着用，
 * 不让推送直接失败。
 *
 * `create: false` 给推送用：目录不存在就别造空的，让调用方按「请先拉取」报错。
 */
function resolveProjectDir(projectUuid, options) {
    const uuid = String(projectUuid || '').trim();
    if (uuid === '') throw new Error('resolveProjectDir: 缺少项目 uuid');
    const opts = options === undefined || options === null ? {} : options;
    const create = opts.create !== false;
    const serverUrl = opts.serverUrl === undefined ? process.env.SERVER_URL || '' : String(opts.serverUrl);
    const here = serverUrl.trim().replace(/\/+$/, '');
    const key = serverKey(here) === '' ? 'unknown' : serverKey(here);

    const isDir = (full) => {
        try {
            return fs.statSync(full).isDirectory();
        } catch (e) {
            return false;
        }
    };
    /**
     * 这个目录是谁拉的：true = 当前服务器，false = 别的服务器，null = 没标记（老目录）。
     * 没标记的老目录当成「可能是我的」—— 由调用处决定要不要认领。
     */
    const sameServer = (dir) => {
        const info = readSource(dir);
        if (info === null) return null;
        return String(info.serverUrl || '').replace(/\/+$/, '') === here;
    };

    const serverDir = path.join(__dirname, key);
    const target = path.join(serverDir, uuid);

    /* 1. 已经在 `<主机-端口>/<uuid>/` 里 —— 正常刷新 / 推送走这条。 */
    if (isDir(target)) {
        if (sameServer(target) !== false) {
            writeSource(target, { serverUrl: here, projectUuid: uuid, serverKey: key });
        }
        /* 被别的服务器占着（文件夹名就是服务器，几乎不可能）也照样用它，别覆盖标记。 */
        return target;
    }

    /* 2. 老结构：把根下那个 `<uuid>/` / `<uuid>@key/` 搬进服务器文件夹。 */
    let legacy = [];
    try {
        legacy = fs.readdirSync(__dirname).filter((name) => {
            if (name !== uuid && name.indexOf(uuid + '@') !== 0) return false;
            return isDir(path.join(__dirname, name));
        });
    } catch (e) {
        legacy = [];
    }
    /*
        同一台服务器可能留下好几个旧目录（老版 `<uuid>/` 和 `<uuid>@主机-端口/` 并存）。
        只搬第一个进服务器文件夹，剩下的不进账、也不替你删 —— 那里面可能有没推上去的
        改动，删不删是人的决定。这里只把话说到位。
    */
    const mine = [];
    for (const name of legacy) {
        if (sameServer(path.join(__dirname, name)) === false) continue; /* 明确是别的服务器的，不碰 */
        mine.push(name);
    }
    for (const name of mine) {
        const old = path.join(__dirname, name);
        try {
            fs.mkdirSync(serverDir, { recursive: true });
            fs.renameSync(old, target);
        } catch (e) {
            /* 搬不动就原地用：老工作区照样能推能拉，只是结构暂时不整齐。 */
            writeSource(old, { serverUrl: here, projectUuid: uuid });
            return old;
        }
        writeSource(target, { serverUrl: here, projectUuid: uuid, serverKey: key });
        const rest = mine.filter((other) => other !== name);
        if (rest.length > 0) {
            console.warn(`⚠ 这个工程在根上有 ${mine.length} 个旧目录，这次只搬了 "${name}"。`);
            console.warn(`  还剩 ${rest.map((item) => '"' + item + '"').join('、')} 在根上；确认里面的改动不需要后手工删掉即可（脚本不会替你删）。`);
        }
        return target;
    }

    /* 3. 都没有 —— 新建（`create: false` 时不建空目录，让调用方报「请先拉取」）。 */
    if (create === true) {
        fs.mkdirSync(target, { recursive: true });
        writeSource(target, { serverUrl: here, projectUuid: uuid, serverKey: key });
    }
    return target;
}

/**
 * 平台登录项目常量：后台管理登录的 projectUuid 必须用它（= 平台登录页 URL 上的 pid）。
 *
 * 用页面 / 项目自己的 uuid 会得到 `{"flag":false,"code":-1,"desc":"用户名或密码错误"}` ——
 * 平台把「项目不对」伪装成了「密码错」，账号密码全对也一样。实测换成这个常量立刻成功。
 * 前端那边（`lib/client.js` 的 `PLATFORM_LOGIN_PROJECT`）用的必须是同一个值。
 */
const PLATFORM_LOGIN_PROJECT = 'beddb82e95d14952b7a80c014c4c19c7';

/**
 * 决定这次用哪套登录。
 *
 * 平台有两套登录接口：
 * - `server/web/login`：设计器登录，body `{userName, password}`。
 * - `manager/web/login`：后台管理登录，body `{tenantName, username, password, projectUuid}`。
 *
 * **业务接口（openapi / crud）只认后台那套的会话** —— 带设计器会话去调会得到
 * `{"flag":false,"code":-20,"desc":"请重新登录"}`，看起来像「没登录」，其实是会话不认。
 *
 * `.env` 里有 `ADMIN_USERNAME` + `ADMIN_PASSWORD` 就走后台登录，否则退回设计器登录
 * （老工作区没有这两个键时行为完全不变）。
 */
function resolveLogin(serverUrl) {
    const adminUser = process.env.ADMIN_USERNAME || '';
    const adminPwd = process.env.ADMIN_PASSWORD || '';
    if (adminUser !== '' && adminPwd !== '') {
        return {
            mode: 'manager',
            url: `${serverUrl}/youyaboot-admin/magical_lowcode/manager/web/login`,
            body: {
                tenantName: process.env.ADMIN_TENANT || process.env.TENANT_NAME || 'admin',
                username: adminUser,
                password: adminPwd,
                projectUuid: process.env.ADMIN_LOGIN_PID || PLATFORM_LOGIN_PROJECT
            }
        };
    }
    return {
        mode: 'server',
        url: `${serverUrl}/youyaboot-admin/magical_lowcode/server/web/login`,
        body: { userName: process.env.USERNAME || '', password: process.env.PASSWORD || '' }
    };
}

/**
 * 登录并获取 Cookie 文件路径
 *
 * 形参 `username` / `password` 保留是为了不动所有调用点，实际取值由 `resolveLogin()`
 * 从 `process.env` 决定（`loadEnv()` 已经把 `.env` 灌进去了）。
 */
function login(serverUrl, username, password, projectDir) {
    const cookiesFile = path.join(projectDir, '.cookies');
    const cfg = resolveLogin(serverUrl);

    try {
        // 密码不拼进命令行，body 从 stdin 递进去：既躲开 Windows cmd.exe 的引号转义地狱，
        // 也不让密码出现在进程列表里。
        const cmd = `curl -s -c "${cookiesFile}" -X POST "${cfg.url}" -H "Content-Type: application/json" --data-binary @-`;
        const response = execSync(cmd, { encoding: 'utf-8', input: JSON.stringify(cfg.body) });

        if (response.includes('"code":0')) {
            return cookiesFile;
        } else {
            throw new Error(`登录失败: ${response}`);
        }
    } catch (error) {
        throw new Error(`登录失败: ${error.message}`);
    }
}

/**
 * 确保登录状态
 */
function ensureLogin(serverUrl, username, password, projectDir) {
    const cookiesFile = path.join(projectDir, '.cookies');

    // 检查 cookie 文件是否存在且有效
    if (fs.existsSync(cookiesFile)) {
        // 检查 cookie 是否过期（简单检查文件修改时间）
        const stats = fs.statSync(cookiesFile);
        const now = Date.now();
        const fileAge = now - stats.mtimeMs;

        // 如果 cookie 文件超过 1 小时，重新登录
        if (fileAge > 3600000) {
            return login(serverUrl, username, password, projectDir);
        }

        return cookiesFile;
    }

    return login(serverUrl, username, password, projectDir);
}

/**
 * 扫描目录下的所有 meta.json 文件
 */
function scanMetaFiles(dirPath, relativePath = '') {
    const results = [];

    if (!fs.existsSync(dirPath)) {
        return results;
    }

    const items = fs.readdirSync(dirPath);

    for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stat = fs.statSync(itemPath);

        if (stat.isDirectory()) {
            const metaFile = path.join(itemPath, 'meta.json');
            if (fs.existsSync(metaFile)) {
                try {
                    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf-8'));
                    results.push({
                        id: meta.id,
                        name: meta.name,
                        path: path.join(relativePath, item),
                        dirPath: itemPath,
                        meta: meta
                    });
                } catch (error) {
                    console.warn(`⚠ 跳过无效 meta.json: ${metaFile}`);
                }
            }

            // 递归扫描子目录
            const childResults = scanMetaFiles(itemPath, path.join(relativePath, item));
            results.push(...childResults);
        }
    }

    return results;
}

/**
 * 扫描目录下的所有 page.json 文件
 */
function scanPageFiles(dirPath, relativePath = '') {
    const results = [];

    if (!fs.existsSync(dirPath)) {
        return results;
    }

    const items = fs.readdirSync(dirPath);

    for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stat = fs.statSync(itemPath);

        if (stat.isDirectory()) {
            const pageJsonPath = path.join(itemPath, 'page.json');

            if (fs.existsSync(pageJsonPath)) {
                try {
                    const pageData = JSON.parse(fs.readFileSync(pageJsonPath, 'utf-8'));
                    results.push({
                        uuid: pageData.uuid,
                        name: pageData.name,
                        path: path.join(relativePath, item),
                        dirPath: itemPath,
                        isDir: pageData.dir === true,
                        pageData: pageData
                    });
                } catch (error) {
                    console.warn(`⚠ 跳过无效 page.json: ${pageJsonPath}`);
                }
            }

            // 递归扫描子目录
            const childResults = scanPageFiles(itemPath, path.join(relativePath, item));
            results.push(...childResults);
        }
    }

    return results;
}

/**
 * 创建 ZIP 压缩包
 */
function createZip(sourceDir, outputPath) {
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(outputPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', () => {
            resolve(outputPath);
        });

        archive.on('error', (err) => {
            reject(err);
        });

        archive.pipe(output);
        archive.directory(sourceDir, false);
        archive.finalize();
    });
}

/**
 * 解压 ZIP 文件
 */
async function extractZip(zipPath, outputDir) {
    try {
        const pendingEntries = [];

        await new Promise((resolve, reject) => {
            fs.createReadStream(zipPath)
                .pipe(unzipper.Parse())
                .on('entry', (entry) => {
                    const filePath = path.join(outputDir, entry.path);
                    const directory = path.dirname(filePath);

                    if (!fs.existsSync(directory)) {
                        fs.mkdirSync(directory, { recursive: true });
                    }

                    if (entry.type === 'Directory') {
                        fs.mkdirSync(filePath, { recursive: true });
                        entry.autodrain();
                    } else {
                        const writeStream = fs.createWriteStream(filePath);
                        entry.pipe(writeStream);

                        // 跟踪每个文件写入完成
                        pendingEntries.push(new Promise((res) => {
                            writeStream.on('finish', res);
                            writeStream.on('error', res);
                        }));
                    }
                })
                .on('close', async () => {
                    // 等待所有文件写入完成
                    await Promise.all(pendingEntries);
                    resolve();
                })
                .on('error', reject);
        });
    } catch (error) {
        throw new Error(`解压失败: ${error.message}`);
    }
}

/**
 * 复制目录
 */
function copyDirectory(src, dest) {
    if (!fs.existsSync(src)) {
        return;
    }

    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }

    const items = fs.readdirSync(src);

    for (const item of items) {
        const srcPath = path.join(src, item);
        const destPath = path.join(dest, item);
        const stat = fs.statSync(srcPath);

        if (stat.isDirectory()) {
            copyDirectory(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

/**
 * 删除目录
 */
function deleteDirectory(dirPath) {
    if (!fs.existsSync(dirPath)) {
        return;
    }

    const items = fs.readdirSync(dirPath);

    for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stat = fs.statSync(itemPath);

        if (stat.isDirectory()) {
            deleteDirectory(itemPath);
        } else {
            fs.unlinkSync(itemPath);
        }
    }

    fs.rmdirSync(dirPath);
}

/**
 * 解析命令行参数
 */
function parseArgs(args) {
    const result = {
        positional: [],
        options: {}
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg.startsWith('-')) {
            // 选项参数
            const key = arg.replace(/^-+/, '');
            const value = args[i + 1];

            if (value && !value.startsWith('-')) {
                result.options[key] = value;
                i++;
            } else {
                result.options[key] = true;
            }
        } else {
            // 位置参数
            result.positional.push(arg);
        }
    }

    return result;
}

/**
 * 生成时间戳（格式：2026-05-18 09:06:44）
 */
function getTimestamp() {
    return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

// 导出所有工具函数
module.exports = {
    SOURCE_FILE,
    loadEnv,
    generateUUID,
    serverKey,
    readSource,
    writeSource,
    appendPushMark,
    resolveProjectDir,
    resolveLogin,
    login,
    ensureLogin,
    scanMetaFiles,
    scanPageFiles,
    createZip,
    extractZip,
    copyDirectory,
    deleteDirectory,
    parseArgs,
    getTimestamp
};
