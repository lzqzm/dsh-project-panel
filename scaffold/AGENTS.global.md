<!-- 由 dsh-project-panel 安装 / 卸载；请勿手工编辑，更新请用工程面板 -->

# 低代码平台工程开发规范（全局）

> **适用范围**：仅当当前工作区根目录下同时存在 `apis/`、`databases/`、`pages/` 三个目录时适用。
> 如果当前工作区不是低代码平台工程，**请忽略本文件全部内容**。

## 关键规则速查

### 数据库操作
- 写数据库相关代码前，必须先读取目标工程 `databases/` 下的表结构 JSON（每个库一个目录，每张表一个 `.json`）
- 严禁伪造不存在的表名或字段名

### API 调用
- 调平台内部接口：`api.post(path, {'body': {...}})`
- 调外部接口：`http.post({url, param})`
- **禁止混用**；严禁伪造 API 路径，必须基于目标工程 `apis/` 下实际定义的接口（读该接口 `meta.json` 的 `path` / `method` / `fullPath`）

### script.js
- 日志必须用 `MC.log()`，禁止 `console.log`
- SQL 返回的下划线字段自动转驼峰，必须按驼峰使用

### 禁止修改
- 平台系统核心资源（`magicalcoder/` 目录及内置组件源码）由平台运行时提供，**不在工作区内**；严禁修改或删除其中任何文件
- 功能扩展一律写在 `pages/` 下的页面代码里

## 工作区结构

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

## 先读工作区根目录下的规范

工作区根目录通常还有两份文件，动代码前请先读：

- `project-rules.md` —— 完整开发规范（数据层 / API 层 / 页面 / 组件 / 生成约束的详细条款都在这里）
- `help.md` —— `source-*.js` 拉取 / 推送脚本说明

## 平台侧资源（本地不存在，不要去找）

以下属于平台运行时资源，由服务平台维护，**不包含在本地工作区镜像中**：

- `magicalcoder/apis/API-FUNCTIONS.md`
- `magicalcoder/pages/PAGES-GUIDE.md`
- `magicalcoder/pages/COMPONENTS-GUIDE.md`
- `magicalcoder/magicalcoder-ui/components/McNewVxeTable.vue`
- `magicalcoder/magicalcoder-ui/components/McNewVxeTableColumn.vue`
- `template-project/pages/p0/`

需要 API 或组件用法时，以目标工程 `apis/` 下真实的 `script.js`、`pages/` 下真实的页面代码为准；不要凭记忆编造组件名、插槽或方法。
