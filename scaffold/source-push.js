#!/usr/bin/env node
/**
 * source-push.js - 将项目推送到 SERVER_URL 指向的服务器
 *
 * 用法: node source-push.js [project_uuid]
 *
 * 环境变量:
 *   SERVER_URL    - 要推送到的服务器地址
 *   LOCAL_URL     - 本地服务器地址
 *   USERNAME      - 用户名
 *   PASSWORD      - 密码
 *
 * 示例:
 *   node source-push.js aaaabbbbccccddddeeeeffff00001111
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const utils = require('./utils');

// 加载 .env（统一走 utils：CRLF 行尾的坑只需要在 utils 里修一次）
//
// 注意：这里必须是**强制覆盖** —— Windows 自带一个 USERNAME 环境变量（当前登录账户名），
// 写成 if (!process.env[key]) 的话 .env 里的登录名会被它顶掉，登录就会拿系统用户名去试。
utils.loadEnv();

const PROJECT_UUID = process.argv[2] || process.env.PROJECT_UUID || '';

if (!PROJECT_UUID) {
    console.error('❌ 错误: 请提供项目UUID或配置 .env 中的 PROJECT_UUID');
    console.error('');
    console.error('用法:');
    console.error('  node source-push.js <project_uuid>');
    console.error('  或在 .env 中配置 PROJECT_UUID 后直接运行:');
    console.error('  node source-push.js');
    process.exit(1);
}

const PROJECT_DIR = utils.resolveProjectDir(PROJECT_UUID, { create: false });

function runScript(scriptName, args) {
    const scriptPath = path.join(__dirname, scriptName);
    const fullArgs = [scriptPath, ...args].join(' ');
    console.log(`  执行: node ${scriptName} ${args.join(' ')}`);
    try {
        execSync(`node ${fullArgs}`, { stdio: 'inherit', cwd: __dirname });
        return true;
    } catch (error) {
        console.error(`✗ ${scriptName} 执行失败`);
        return false;
    }
}

async function main() {
    console.log('========================================');
    console.log('  MagicalCoder Source Push');
    console.log('========================================');
    console.log(`服务器:    ${process.env.SERVER_URL || '(未配置 SERVER_URL)'}`);
    console.log(`项目UUID:  ${PROJECT_UUID}`);
    console.log(`项目目录:  ${PROJECT_DIR}`);
    console.log('========================================');
    console.log('');

    console.log('[1/2] 推送 APIs...');
    if (!runScript('source-api-push.js', ['-a'])) {
        process.exit(1);
    }
    console.log('✓ APIs 推送完成');
    console.log('');

    console.log('[2/2] 推送 Pages...');
    if (!runScript('source-page-push.js', ['-a'])) {
        process.exit(1);
    }
    console.log('✓ Pages 推送完成');
    console.log('');

    console.log('========================================');
    console.log('  推送完成!');
    console.log('========================================');
}

main();
