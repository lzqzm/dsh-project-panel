# 项目开发规则

本文件是工作区指令入口，支持 `AGENTS.md` 的编码助手会自动加载它。
使用 Trae 时，可在 `.trae/rules/` 下放一份同源副本。

## 工作区结构

本工作区是低代码平台工程的**本地镜像容器**，可以同时存放多个工程：

```
<工作区>/
├── <projectUuid>/          # 每个 uuid 目录 = 一个低代码工程
│   ├── apis/               # 每个 API 一个目录：meta.json + script.js
│   ├── databases/          # 每个数据库一个目录，每张表一个 .json
│   └── pages/              # 每个页面一个目录：index.html / page.css / page.js / page.json
├── project-rules.md        # 完整开发规范（详细条款看这里）
├── help.md                 # source-*.js 同步 / 推送脚本说明
└── source-*.js             # 拉取、推送脚本
```

动任何文件之前，先确认它属于哪个 `<projectUuid>/` —— 路径写错就会改到别的工程。

## 必读规范文件

在开始任何代码编写任务前，必须先读取以下规范文件并严格遵守：

- **低代码平台开发规范**：`project-rules.md`（工作目录根下）
- **同步 / 推送脚本说明**：`help.md`

## 关键规则速查

> 以下仅为提醒，完整规范见 `project-rules.md`。

### 数据库操作
- 编写数据库相关代码前，必须先读取目标工程 `databases/` 下的表结构 JSON（每个文件对应一张表）
- 严禁伪造不存在的表名或字段名

### API 调用
- **调用平台内部接口**：必须使用 `api.post(path, {'body': {...}})`
- **调用外部接口**：必须使用 `http.post({url, param})`
- 禁止混用两种方式
- 严禁伪造 API 路径，必须基于目标工程 `apis/` 下实际定义的接口调用（读该接口 `meta.json` 的 `path` / `method` / `fullPath`）

### script.js 脚本
- 日志输出必须使用 `MC.log()`，禁止使用 `console.log`
- SQL 返回的下划线字段会自动转为驼峰，使用时必须用驼峰格式

### 禁止修改
- 平台系统核心资源（`magicalcoder/` 目录及其内置组件源码）**由平台运行时提供，不在本工作区内**；若在别处遇到该目录，严禁修改或删除其中任何文件
- 功能扩展一律写在 `pages/` 下的页面代码里
- 严禁伪造 API 路径，必须基于 `apis/` 目录下实际定义的接口调用

### 本地同步与推送
- 同步 / 推送脚本说明详见 `help.md`

## 平台侧资源（本地不存在，不要去找）

以下几项属于平台运行时资源，由服务平台维护，**不包含在本地工作区镜像中**。`project-rules.md` 里已逐处标注，这里再列一次以免误读：

- `magicalcoder/apis/API-FUNCTIONS.md`
- `magicalcoder/pages/PAGES-GUIDE.md`
- `magicalcoder/pages/COMPONENTS-GUIDE.md`
- `magicalcoder/magicalcoder-ui/components/McNewVxeTable.vue`
- `magicalcoder/magicalcoder-ui/components/McNewVxeTableColumn.vue`
- `template-project/pages/p0/`

需要 API 或组件用法时，以目标工程 `apis/` 下真实的 `script.js`、`pages/` 下真实的页面代码为准；不要凭记忆编造组件名、插槽或方法。
