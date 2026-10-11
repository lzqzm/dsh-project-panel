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
    loadEnv,
    generateUUID,
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
