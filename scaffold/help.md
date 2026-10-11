# MagicalCoder 本地开发工具

本地开发工具集，用于在本地和线上环境之间同步 API、页面和数据库配置。

## 环境配置

在 `.env` 文件中配置：

```env
# 服务器地址
SERVER_URL=http://localhost:28080
LOCAL_URL=http://localhost:8080

# 线上服务器地址（ENV=server 时使用）
SERVER_URL=http://your-server.com

# 登录凭证
USERNAME=your_username
PASSWORD=your_password

# 项目 UUID
PROJECT_UUID=aaaabbbbccccddddeeeeffff00001111

# 环境类型：local 或 server
ENV=local
```

## 脚本列表

### 1. source-clone.js - 克隆项目

从线上拉取完整的项目结构到本地。

```bash
node source-clone.js <project_uuid>
```

**环境变量：**
- `PULL_FILE` - 指定要拉取的文件类型（默认全部）
  - 格式：`[ 'page', 'api', 'database']` 或 `page,api,database`
  - 示例：`PULL_FILE=[ 'page', 'api']`

**示例：**
```bash
# 拉取所有文件
node source-clone.js aaaabbbbccccddddeeeeffff00001111

# 只拉取页面
PULL_FILE=[ 'page'] node source-clone.js aaaabbbbccccddddeeeeffff00001111

# 只拉取页面和API
PULL_FILE=[ 'page', 'api'] node source-clone.js aaaabbbbccccddddeeeeffff00001111
```

---

### 2. source-pull.js - 拉取项目（支持按类型）

从线上拉取项目，支持指定要拉取的类型。

```bash
node source-pull.js <project_uuid>
```

**环境变量：**
- `PULL_FILE` - 指定要拉取的文件类型
  - 可选值：`page`, `api`, `database`
  - 示例：`PULL_FILE=[ 'page', 'api']`

**示例：**
```bash
# 拉取所有类型
node source-pull.js aaaabbbbccccddddeeeeffff00001111

# 只拉取页面
PULL_FILE=[ 'page'] node source-pull.js aaaabbbbccccddddeeeeffff00001111
```

---

### 3. source-push.js - 全量推送项目

将本地项目推送到线上环境（本地或线上）。

```bash
node source-push.js <project_uuid>
```

**参数：**
- `<project_uuid>` - 项目 UUID

**环境变量：**
- `ENV` - 环境类型：`local`（默认）或 `server`

**示例：**
```bash
# 推送到本地环境
node source-push.js aaaabbbbccccddddeeeeffff00001111

# 推送到线上环境
ENV=server node source-push.js aaaabbbbccccddddeeeeffff00001111
```

---

### 4. source-api-pull.js - 拉取 API

从线上拉取 API，支持拉取单个、目录或全部 API。

```bash
node source-api-pull.js [api-id|-a]
```

**参数：**
- `api-id` - API ID 或目录 ID
  - 如果是目录 ID，则拉取该目录及目录下的所有 API
  - 如果是 API ID，则只拉取该 API
- `-a` - 拉取所有 API

**示例：**
```bash
# 拉取所有 API
node source-api-pull.js -a

# 拉取指定目录的所有 API
node source-api-pull.js abc123

# 拉取单个 API
node source-api-pull.js abc123
```

---

### 5. source-api-push.js - 推送 API

将本地 API 推送到线上，支持推送单个、目录或全部 API。

```bash
node source-api-push.js [api-id|-a]
```
**参数：**
- `api-id` - API ID 或目录 ID
  - 如果是目录 ID，则推送该目录及目录下的所有 API
  - 如果是 API ID，则只推送该 API
- `-a` - 推送所有 API

**示例：**
```bash
# 推送所有 API
node source-api-push.js -a

# 推送指定目录的所有 API
node source-api-push.js abc123

# 推送单个 API
node source-api-push.js abc123
```

---

### 6. source-page-pull.js - 拉取页面

从线上拉取页面，支持拉取单个、目录或全部页面。

```bash
node source-page-pull.js [page-uuid|-a]
```

**参数：**
- `page-uuid` - 页面 UUID 或目录 UUID
  - 如果是目录 UUID，则拉取该目录及目录下的所有页面
  - 如果是页面 UUID，则只拉取该页面
- `-a` - 拉取所有页面

**示例：**
```bash
# 拉取所有页面
node source-page-pull.js -a

# 拉取指定目录的所有页面
node source-page-pull.js abc123

# 拉取单个页面
node source-page-pull.js def456
```

---

### 7. source-page-push.js - 推送页面

将本地页面推送到线上，支持推送单个、目录或全部页面。

```bash
node source-page-push.js [page-uuid|-a]
```

**参数：**
- `page-uuid` - 页面 UUID 或目录 UUID
  - 如果是目录 UUID，则推送该目录及目录下的所有页面
  - 如果是页面 UUID，则只推送该页面
- `-a` - 推送所有页面

**示例：**
```bash
# 推送所有页面
node source-page-push.js -a

# 推送指定目录的所有页面
node source-page-pull.js abc123

# 推送单个页面
node source-page-pull.js def456
```

---

### 8. source-db-pull.js - 拉取数据库配置

从线上拉取数据库配置（完全覆盖本地）。

```bash
node source-db-pull.js [project_uuid]
```

**参数：**
- `project_uuid` - 项目 UUID（可选，会从 .env 或已存在的 manifest.json 获取）

**示例：**
```bash
# 拉取数据库配置
node source-db-pull.js aaaabbbbccccddddeeeeffff00001111
```

---

## 目录结构

拉取后的项目目录结构：

```
<project_uuid>/
├── manifest.json          # 项目清单
├── apis/                  # API 目录
│   ├── <目录名>/
│   │   ├── meta.json     # 目录元数据
│   │   └── <API名>/
│   │       ├── meta.json # API 元数据
│   │       └── script.js # API 脚本
├── pages/                 # 页面目录
│   └── <页面名>/
│       ├── page.json     # 页面配置
│       ├── index.html    # HTML 代码
│       ├── page.css      # CSS 代码
│       └── page.js       # JavaScript 代码
├── databases/             # 数据库配置
│   └── <数据库名>/
│       └── <表名>.json
└── components/            # 组件配置（如有）
```

## 注意事项

1. **推送前需先拉取**：首次推送前，请先运行 `source-pull.js` 拉取完整项目
2. **环境隔离**：本地和线上环境数据独立，互不影响
3. **备份机制**：推送过程中会创建临时备份，失败时可手动恢复
4. **Cookie 缓存**：登录凭证会缓存到 `.cookies` 文件中
