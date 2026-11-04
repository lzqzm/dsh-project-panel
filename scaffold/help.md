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

# 设计器账号：只有在没有后台账号时才用它兜底
USERNAME=your_username
PASSWORD=your_password

# 后台管理账号（推荐）
# 在面板的「服务器」档案里填好后台账号密码，运行脚本时面板会自动写进 .env
ADMIN_USERNAME=your_admin_username
ADMIN_PASSWORD=your_admin_password
ADMIN_TENANT=admin
# 平台固定的登录项目 ID（= 后台登录页地址上的 pid），一般不用改
ADMIN_LOGIN_PID=beddb82e95d14952b7a80c014c4c19c7

# 项目 UUID
PROJECT_UUID=aaaabbbbccccddddeeeeffff00001111

# 环境类型：local 或 server
ENV=local
```

### 两套登录接口，别搞混

| 有 `ADMIN_USERNAME` + `ADMIN_PASSWORD` | 走哪套 | 能干什么 |
| --- | --- | --- |
| 是 | 后台管理登录 `…/manager/web/login` | 全部：项目包拉取 / 推送，以及 openapi / crud 等**业务接口** |
| 否 | 设计器登录 `…/server/web/login` | 只能拉取 / 推送项目包；调业务接口会返回 `{"flag":false,"code":-20,"desc":"请重新登录"}` |

- 后台登录的 `projectUuid` 必须用平台固定值 `beddb82e95d14952b7a80c014c4c19c7`，**不是**当前工程的 uuid。传当前工程的 uuid 会被平台报成「用户名或密码错误」，很容易误判成密码打错。
- 所以：**优先在面板里填后台账号密码**（面板会自动补 `ADMIN_*` 四个键）。手工写 `.env` 时把后台账号也写上，否则脚本会退回设计器登录。

### 工程目录怎么摆（按服务器分文件夹）

工作区下先按**来源服务器**分文件夹，再放工程：`<主机-端口>/<工程 uuid>/`。项目 uuid 只在一台服务器内唯一，分成两层之后，两台服务器上的同名工程天然分开，`.cookies` 也不会串台。

文件夹名就是 `utils.js` 里 `serverKey()` 的结果：`http://203.0.113.10:28080` → `203.0.113.10-28080`。面板的文件树里优先显示你在面板里填的服务器备注名，没填就显示这个文件夹名。

| 情况 | 落到哪个目录 |
| --- | --- |
| 工作区里还没有这个工程 | `<主机-端口>/<uuid>/` |
| 老工作区里的 `<uuid>/`（没有来源标记） | 自动迁移到 `<主机-端口>/<uuid>/` |
| 老工作区里的 `<uuid>/`，标记属于当前 `SERVER_URL` | 自动迁移到 `<主机-端口>/<uuid>/` |
| 老工作区里的 `<uuid>/`，标记属于**另一台**服务器 | 不动它，按当前服务器另建 `<主机-端口>/<uuid>/` |

迁移由脚本自己完成（`renameSync`）；搬不动时（比如目录被编辑器占着）会留在原地并在控制台提示，不会让推送失败。

**脚本只认自己那台服务器**：一次运行只知道 `.env` 里的 `SERVER_URL`，所以根上躺着好几台服务器的老目录时，跑一次只能搬走一个。想一次全归位，用面板顶栏的 **「整理」** 按钮：

- 挨个读根上每个老目录的 `.project-source.json`，按各自的来源服务器搬进 `<主机-端口>/<uuid>/`；
- 没有来源标记的老目录，按面板里绑定的服务器认领，没绑定就看 `.env` 的 `SERVER_URL`；
- 目标位置已经有一份时，比两边的目录修改时间，新的一方留在正式位置，旧的一方改名成 `<uuid>.旧-<时间戳>` 留在同一个服务器文件夹里；
- **只改名，不删任何文件**，搬不动就跳过并报告。

判据是每个工程目录里的 `.project-source.json`（内容形如 `{"serverUrl": "http://…", "projectUuid": "…"}`）。它由脚本自己维护，**别手改、也别删** —— 删了之后那个目录会在下次拉取时被当成老目录认领给当时的 `SERVER_URL`。

想手动确认某个目录属于哪台服务器：

```bash
node -e "console.log(require('./utils').readSource('<uuid 目录>'))"
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

拉取后的项目目录结构（`<主机-端口>` 是来源服务器，同一台服务器上的多个工程共用这个文件夹）：

```
<主机-端口>/
└── <project_uuid>/
    ├── manifest.json          # 项目清单
    ├── apis/                  # API 目录
    │   └── <目录名>/
    │       ├── meta.json      # 目录元数据
    │       └── <API名>/
    │           ├── meta.json  # API 元数据
    │           └── script.js  # API 脚本
    ├── pages/                 # 页面目录
    │   └── <页面名>/
    │       ├── page.json      # 页面配置
    │       ├── index.html     # HTML 代码
    │       ├── page.css       # CSS 代码
    │       └── page.js        # JavaScript 代码
    ├── databases/             # 数据库配置
    │   └── <数据库名>/
    │       └── <表名>.json
    └── components/            # 组件配置（如有）
```

## 推送状态怎么算的

树上的「已推送 / 待推送」是本地账本 + 脚本推送戳一起算出来的：

- **面板里点的推送 / 拉取**：跑完由面板逐单元记账（记住这一版每个文件的 mtime）。
- **自己（或 AI）在终端里跑 `node source-xxx-push.js …`**：脚本推送成功后会往工作区根
  `.push-log.jsonl` 追加一行 `{ at, zone, dir }`。面板下次扫描时拿它补账 —— 该单元里所有
  文件的 mtime 都不晚于这个时刻，就算已推送；之后又改了文件，自然变回「待推送」。
- 这个文件是点开头的，文件树里本来就隐藏；只保留最近 30 天、最多 5000 行。

所以两种推送方式面板都认，不用再手动点「标记已推送」。

## 注意事项

1. **推送前需先拉取**：首次推送前，请先运行 `source-clone.js` 拉取完整项目
2. **环境隔离**：本地和线上环境数据独立，互不影响
3. **备份机制**：推送过程中会创建临时备份，失败时可手动恢复
4. **Cookie 缓存**：登录凭证会缓存到 `.cookies` 文件中
5. **`.env` 编码**：脚本会自动剥掉 BOM、并兼容 CRLF 换行。记事本「另存为 UTF-8」会在开头写 BOM（第一个键会变成 `\uFEFFSERVER_URL`），Windows 记事本默认换行是 CRLF（旧版解析会让所有值变成 `undefined`、`USERNAME` 还会退化成 Windows 账户名）—— 现在两种都能读，但仍建议让面板生成 `.env`，别手写
6. **手动跑脚本时**：`node source-xxx.js` 读的是工作区根目录的 `.env`，所以要么先在面板里跑一次让它写 `.env`，要么自己把 `ADMIN_USERNAME` / `ADMIN_PASSWORD` / `ADMIN_TENANT` 补上，否则会退回设计器登录
7. **别用 `Invoke-WebRequest` 手工拼 `Cookie` 头验证接口**：会得到假的登录失败，用 `curl -c` / `-b` 的 cookie jar 才准
