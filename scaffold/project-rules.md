pages的页面规则如下

## 数据层规范

> ⚠️ **重要约束**：低代码平台的所有业务开发必须基于 `databases` 目录下定义的数据表结构进行展开。**严禁伪造不存在的表名、字段名或数据类型**。

### 表结构目录

项目所有表结构定义存放在：
- **目录位置**：`databases/` 目录下
- **结构说明**：每个数据库一个目录，目录下包含多个 `.json` 文件，每个 JSON 文件对应一张表

### AI 表结构查询规则

> **重要**：AI 在编写涉及数据库操作的代码前，必须先读取 `databases` 目录下的表结构 JSON 文件，了解当前项目实际拥有的表和字段。

#### 查询步骤

1. **查看数据库列表**：读取 `databases/` 目录下的子目录（每个子目录对应一个数据库）
2. **查看数据表列表**：读取各数据库目录下的 `.json` 文件（每个文件对应一张表）
3. **读取表结构**：读取具体表的 JSON 文件，了解字段定义
4. **获取字段信息**：从 `mcTable.columns` 数组中获取所有字段的详细信息

#### 表结构 JSON 文件格式

```json
{
  "mcTable": {
    "tableName": "表名",
    "primary": [
      {
        "javaName": "主键字段名",
        "javaType": "Java类型",
        "pkType": "主键类型",
        "comment": "字段注释"
      }
    ],
    "columns": [
      {
        "javaName": "字段名",
        "javaType": "Java类型",
        "comment": "字段注释",
        "dbName": "数据库字段名"
      }
    ]
  },
  "name": "表名"
}
```

#### 字段类型对照表

| Java 类型 | 说明 |
|----------|------|
| String | 字符串类型 |
| Integer | 整数类型 |
| Long | 长整数类型 |
| Boolean | 布尔类型 |
| Double | 双精度浮点类型 |
| BigDecimal | 高精度小数类型 |
| Date | 日期类型 |
| Timestamp | 时间戳类型 |
| Text | 文本类型（长文本） |

### AI 数据操作规范

> **重要**：在编写涉及数据库操作的代码时，AI 必须：

1. ✅ **必须先读取表结构**
   - 先读取 `databases/` 目录了解有哪些数据库
   - 再读取具体表的 JSON 文件了解字段信息
   - 禁止在不了解表结构的情况下编写代码

2. ❌ **禁止伪造数据**
   - ❌ 禁止使用不存在的表名
   - ❌ 禁止使用不存在的字段名
   - ❌ 禁止使用不匹配的 Java 类型
   - ✅ 只能使用表中已定义的字段

3. ✅ **正确的主键处理**
   - 主键字段使用 `mc-pk-type="UUID"` 自动生成
   - 在表单中标记 `disabled="disabled"`
   - 用户无需填写主键

4. ✅ **接口路径规范**
   - CRUD 接口路径格式：`magical_lowcode/openapi/crud/{表名}/page`
   - 查询接口：POST
   - 保存接口：POST
   - 更新接口：POST
   - 删除接口：POST

5. ⚠️ **新增表结构**
   - 如需新增表结构，应在 `databases` 目录下创建对应的 JSON 文件
   - 参考现有表的 JSON 格式
   - 定义完整的表名、字段、类型、约束等信息

### 错误示例

❌ **错误：使用了不存在的字段**
```html
<!-- 错误：使用了未定义的字段 -->
<mc-input v-model="row.xxx"></mc-input>
```

❌ **错误：使用了不匹配的数据类型**
```javascript
// 错误：对非字符串类型调用字符串方法
var value = this.form.xxx.trim();
```

### 正确示例

✅ **正确：使用已定义的字段**
```html
<!-- 正确：使用表结构中定义的字段 -->
<mc-input v-model="row.字段名" placeholder="请输入内容"></mc-input>
```

✅ **正确：使用正确的字段和类型**
```javascript
// 正确：根据实际类型处理数据
var value = this.form.字段名;
```

---

## API 层规范

> 📚 **完整 API 内置函数文档**：平台侧 `magicalcoder/apis/API-FUNCTIONS.md`，**不在本地工作区内**，无法直接读取。需要确认内置函数用法时，以本工程 `apis/` 下已落地的 `script.js` 为准，不要凭记忆编造函数名。

### API 目录结构

项目所有 API 定义存放在：
- **目录位置**：`apis/` 目录下
- **结构说明**：按业务分类组织，每个 API 对应一个文件夹，包含 `meta.json` 和 `script.js`

```
apis/
├── {分类1}/
│   ├── {API名称1}/
│   │   ├── meta.json    # API 元数据
│   │   └── script.js     # API 业务逻辑
│   └── {API名称2}/
│       ├── meta.json
│       └── script.js
└── {分类2}/
    └── ...
```

### API 元数据结构

每个 API 的 `meta.json` 文件包含以下关键信息：

```json
{
  "id": "API唯一ID",
  "path": "/api路径",
  "fullPath": "/magical_lowcode/openapi/{projectUuid}/{apiPath}",
  "method": "POST",
  "type": "Ql",
  "name": "API名称",
  "datasource": "mysql",
  "scriptType": "js",
  "service": "api",
  "directoryId": "目录ID"
}
```

**关键字段说明**：

| 字段名 | 说明 | 示例 |
|--------|------|------|
| `path` | API 路径 | `/g2`、`/user-list` |
| `fullPath` | 完整访问路径 | `/magical_lowcode/openapi/{projectUuid}/{path}` |
| `method` | HTTP 请求方法 | `POST`、`GET` |
| `name` | API 名称 | `查收`、`user-list` |
| `datasource` | 数据源类型 | `mysql`、`api` |

### API 调用规范

#### 调用方式

在 page.js 中使用 `$magicaltool.request.axios()` 调用 API：

```javascript
var myMethod = {
    调用方法名: function(e) {
        var _this = this;
        $magicaltool.request.axios({
            $vue: this,                    // 必须：传递 Vue 实例
            method: "post",               // 请求方法
            contentType: "application/json", // 内容类型:application/json、blob
            
            alert:false,  // 是否显示错误提示
            reject:false,  // 是否拒绝错误响应
            timeout:5000,  // 请求超时时间（毫秒）
            // responseType:"blob",      // 开启了后，返回的响应数据为 Blob 类型，需要手动处理
            url: "/magical_lowcode/openapi/{projectUuid}/{apiPath}", // API 完整路径
            param: {                      // 请求参数
                param:{
                    字段1: 值1,
                    字段2: 值2
                }
            }
        })
        .then(function(response) {
            var data = response.data;
            if(response.flag==false){
                _this.$message({ showClose: true,message: data,type: 'error'});
                return;
            }
            
            // 处理响应数据
        })
        .catch(function(error) {
            // 处理错误
        });
    }
};
```

#### URL 路径格式

```
/magical_lowcode/openapi/{projectUuid}/{apiPath}
```

- **`{projectUuid}`**：项目唯一标识符（从 `apis/` 上一级目录名获取）
- **`{apiPath}`**：API 的 `path` 字段值

**示例**：
- projectUuid = `aaaabbbbccccddddeeeeffff00001111`
- apiPath = `/g2`（来自 meta.json 的 path 字段）
- 完整 URL = `/magical_lowcode/openapi/aaaabbbbccccddddeeeeffff00001111/g2`

### HTML 绑定规范

在 index.html 中，可以通过 `mc-model` 绑定按钮状态：

```html
<!-- 绑定按钮的点击状态 -->
<el-button :mc-model="buttonValue" @click="click">确定</el-button>
```

### 完整调用示例

#### 1. 简单 API 调用

```html
<el-button type="primary" @click="submitForm">提交</el-button>
```

```javascript
var myMethod = {
    submitForm: function(e) {
        var _this = this;
        $magicaltool.request.axios({
            $vue: this,
            method: "post",
            contentType: "application/json",
            alert:false,  // 是否显示错误提示
            reject:false,  // 是否拒绝错误响应
            timeout:5000,  // 请求超时时间（毫秒）
            url: "/magical_lowcode/openapi/aaaabbbbccccddddeeeeffff00001111/g2",
            param: {
                name: "test",
                value: 123
            }
        })
        .then(function(response) {

            console.log("成功：", response.data);
            // 业务处理
        })
        .catch(function(error) {
            console.error("失败：", error);
        });
    }
};
```

#### 2. 带查询参数的 API 调用

```javascript
var myMethod = {
    queryData: function() {
        var _this = this;
        $magicaltool.request.axios({
            $vue: this,
            method: "post",
            contentType: "application/json",
            url: "/magical_lowcode/openapi/aaaabbbbccccddddeeeeffff00001111/search",
            param: {
                keyword: this.searchKeyword,
                page: 1,
                size: 10
            }
        })
        .then(function(response) {
            var data = response.data;
            _this.tableData = data.list || [];
            _this.total = data.total || 0;
        });
    }
};
```

### AI API 调用规范

> **重要**：在编写涉及 API 调用的代码时，AI 必须：

1. ✅ **必须先读取 API 元数据**
   - 先读取 `apis/` 目录了解有哪些 API
   - 再读取具体 API 的 `meta.json` 获取 `path` 和 `method`
   - 使用 `meta.json` 中的 `fullPath` 或自行拼接完整 URL

2. ❌ **禁止硬编码 API 路径**
   - ❌ 禁止使用不存在的 API 路径
   - ❌ 禁止随意编造 URL
   - ✅ 必须基于 `apis/` 目录下定义的 API 进行调用

3. ✅ **正确的请求格式**
   - `$vue` 参数必须传递当前 Vue 实例（`this`）
   - `contentType` 通常使用 `application/json`
   - `param` 参数根据 API 实际需求传递

4. ⚠️ **错误处理**
   - ✅ 使用 `.then()` 处理成功响应
   - ✅ 使用 `.catch()` 处理错误情况

---

## 页面开发规范

> 📚 **完整的页面开发指南**：平台侧 `magicalcoder/pages/PAGES-GUIDE.md`，**不在本地工作区内**。页面目录结构以本工程 `pages/` 下真实的页面为准，照既有页面的写法来。

---

## 页面生命周期

1. **加载**：系统读取 page.json 获取页面配置
2. **渲染**：加载 index.html 和 page.css 构建页面结构
3. **初始化**：加载 page.js，初始化 Vue 实例和数据
4. **挂载**：执行 vueMounted 钩子函数
5. **交互**：用户与页面交互，触发 vueMethod 中的方法

---

## 低代码平台自动组装机制

### 组装过程

低代码平台会自动将 `pages` 目录下的各个 page 代码组装成最终的 `index.html` 文件：

1. **HTML 模板组装**：合并所有 page 的 index.html 中的模板内容到 `<div id="magicalDragScene">` 内部
2. **CSS 样式组装**：合并所有 page 的 page.css 中的样式到全局 `<style>` 标签
3. **JavaScript 组装**：合并所有 page 的 page.js 中的逻辑代码
4. **Vue 实例初始化**：添加全局的 Vue 实例初始化代码

### 最终 index.html 结构

组装后的 index.html 文件包含以下核心部分：

```html
<!DOCTYPE html>
<html>
<head>
    <!-- 全局资源引入 - 由低代码平台自动注入 -->
    <script type="text/javascript" src="assets/drag/js/user/iframe/element/latest/components/import.js"></script>
    <style>
        /* 所有 page 的 CSS 样式合并 */
    </style>
</head>
<body>
    <div id="magicalDragScene" class="mc-root" mc-page-id="...">
        <!-- 所有 page 的 HTML 模板内容 -->
    </div>
    <script>
        // 预置全局变量（vueData, vueMethod 等）
        var vueData = {};
        
        // 用户自定义方法合并
        var myMethod = {};
        for (var key in myMethod) {
            vueMethod[key] = myMethod[key];
        }
        
        // 自定义数据、监听器、计算属性
        var myData = {};
        var myWatch = {};
        var myComputed = {};
        
        // Vue 实例初始化
        vueData.scope = {row: {}};
        vueData.MC = window.MC;
        Object.assign(vueData, myData);
        
        // 合并监听器
        if (typeof vueWatch !== "undefined" && typeof myWatch !== "undefined") {
            Object.assign(vueWatch, myWatch);
        }
        
        // 合并计算属性
        if (typeof vueComputed !== "undefined" && typeof myComputed !== "undefined") {
            Object.assign(vueComputed, myComputed);
        }
        
        // 挂载到全局对象
        window.vueData = vueData;
        window.MC.vdata = vueData;
    </script>
</body>
</html>
```

### 全局资源加载机制

低代码平台通过 `__import()` 函数自动加载所有必需的资源和依赖项。这些资源属于平台运行时（`magicalcoder/` 目录），**不包含在本地工作区镜像中**，由平台侧统一提供，在页面里开箱即用。

> ⚠️ **重要约束**：`magicalcoder/` 目录下的所有文件均为系统核心资源和配置，**AI 禁止修改或删除该目录下的任何文件**。本地工作区里通常看不到该目录，请勿试图寻找、下载或重建它。如有功能扩展需求，应在 `pages/` 目录下的页面代码中实现。

#### 可用的库和资源

##### CSS 样式库

- **MagicalCoder 基础样式** - MagicalCoder 组件样式
- **Element UI** - 完整 UI 组件库样式
- **KindEditor** - 富文本编辑器样式
- **Leaflet** - 地图库样式
- **RemixIcon** - 图标库样式
- **Datav** - 数据可视化样式
- **vxe-table** - 高级表格样式

##### JavaScript 基础库

- **Vue 2.x** - Vue 核心库
- **Axios** - HTTP 请求库
- **jQuery** - jQuery 库
- **Lodash** - 函数工具库
- **JSON3** - JSON 解析库
- **ES6-Promise** - Promise 兼容库

##### Vue 生态组件

- **vue-lazyload** - 图片懒加载
- **vue-seamless-scroll** - 无缝滚动组件

##### 图表与可视化

- **ECharts 5.x** - 图表库（包含中国地图、统计扩展、水球图、数据工具等扩展）
- **html2canvas** - HTML 转图片
- **jsbarcode** - 条形码生成
- **jrqrcode** - 二维码生成
- **Datav** - 数据可视化组件

##### 表格组件

- **vxe-table 3.15.15** - 高级表格组件（包含 xe-utils、vxe-ui）

##### 编辑器和工具

- **KindEditor** - 富文本编辑器（支持中文语言包）
- **Leaflet** - 地图库

##### 用户自定义组件

- 支持最多 10 个用户自定义组件（user-components1 ~ user-components10）
- 支持用户自定义 CSS 样式

### 关键组装逻辑

- **vueData 合并**：`Object.assign(vueData, myData)` - 将自定义数据合并到主数据对象
- **作用域隔离**：`vueData.scope = {row: {}}` - 提供作用域隔离机制
- **全局对象**：`window.MC.vdata` - 挂载到全局的 MC 对象，方便全局访问
- **自动合并**：系统自动处理 myMethod、myData、myWatch、myComputed 的合并逻辑

---

## 低代码平台内置组件库

> 📚 **完整的组件使用指南**：平台侧 `magicalcoder/pages/COMPONENTS-GUIDE.md`，**不在本地工作区内**。需要组件用法时，以本工程 `pages/` 下真实页面里的既有用法为准。

低代码平台提供了丰富的内置组件库，封装自平台侧 `magicalcoder/pages/magicalcoder-ui/components` 目录下的 Vue 组件。这些组件在页面里开箱即用、无需额外安装，但**本地工作区不含其源码**。

---

## AI 代码生成约束

作为 AI 代码助手，在为低代码平台生成代码时，必须严格遵守以下约束：

### 🔒 绝对禁止的行为

1. **禁止修改系统核心文件**
   - ❌ 严禁修改或删除平台 `magicalcoder/` 目录下的任何文件（该目录不在本地工作区内）
   - ❌ 严禁修改或删除低代码平台的内置组件源码
   - ❌ 严禁修改已打包的第三方库文件

2. **禁止修改预置代码**
   - ❌ 严禁修改 `page.js` 中的预置全局变量区域（vueData、vueComputed、vueWatch、vueMethod、vueMounted）
   - ❌ 严禁修改系统自动生成的代码结构
   - ❌ 严禁修改 page.js 中的合并逻辑（`for (var key in myMethod)` 等）
   - ⚠️ **重要**：page.js 中只有 `myMethod`、`myData`、`myWatch`、`myComputed` 这些用户自定义区域允许 AI 修改

### ✅ 允许的操作范围

1. **页面级开发**
   - ✅ 可以在 `pages` 目录下创建新的页面
   - ✅ 可以修改 `pages` 目录下各页面的 index.html、page.css、page.js
   - ✅ 可以在页面代码中编写自定义业务逻辑

2. **功能扩展**
   - ✅ 可以封装可复用的业务组件（放在 pages 或其他自定义目录）
   - ✅ 可以在页面代码中扩展现有功能
   - ✅ 可以在 myMethod、myData、myWatch、myComputed 区域添加自定义代码

3. **资源使用**
   - ✅ 可以自由使用全局资源库（Vue、Axios、Element UI、ECharts 等）
   - ✅ 可以使用平台提供的 MC 组件库
   - ✅ 可以使用用户自定义组件（user-components）

### 📝 代码生成原则

1. **遵循现有规范**
   - 使用规范的命名约定
   - 遵守组件使用方式
   - 遵循代码组织结构

2. **保持代码质量**
   - 提供清晰的中文注释
   - 确保代码可维护性
   - 避免重复造轮子

3. **优先使用内置功能**
   - 优先使用 MC 组件库
   - 优先使用全局资源
   - 避免重复引入已存在的库

### ⚠️ 违规后果

违反上述约束可能导致：
- 系统功能损坏
- 页面无法正常加载
- 平台运行异常
- 需要重新恢复被修改的系统文件

---

**提示**：本规范旨在保护低代码平台的核心功能稳定性和可维护性。请在允许的范围内发挥创造力，为平台添加有价值的业务功能。

---

## 本地同步与推送

> 同步/推送脚本说明详见 [help.md](help.md)

---

## 标准 CRUD 表格场景实现规范

大多数表格场景推荐使用封装好的 `mc-new-vxe-table` 组件实现。这是低代码平台的标准表格解决方案，开箱即用。

### 组件学习资料

**⚠️ 重要提示**：`mc-new-vxe-table` 是基于 `vxe-table` 封装的，功能非常丰富（包含 40+ 属性、20+ 方法、10+ 插槽）。本规范只描述常用部分，**不要凭记忆编造属性、插槽或方法名**。

#### 组件源码位置

- **主组件**：平台侧 `magicalcoder/magicalcoder-ui/components/McNewVxeTable.vue`
- **列组件**：平台侧 `magicalcoder/magicalcoder-ui/components/McNewVxeTableColumn.vue`

> ⚠️ 这两个源码文件**不在本地工作区内**，无法直接读取。

#### 学习建议

1. **看本工程已有页面**：在本工程 `pages/` 下搜索已经在用 `mc-new-vxe-table` 的页面，照它的写法来
2. **看平台文档**：需要权威说明时，到平台侧查阅组件源码与文档（本地镜像不含）
3. **拿不准就问**：属性或插槽没有把握时先向用户确认，不要猜

### 快速入门示例

#### 基础用法

```html
<mc-new-vxe-table
    :data.sync="tableList"
    mc-query-url="后端查询接口"
    mc-save-url="后端保存接口"
    mc-update-url="后端更新接口"
    mc-delete-url="后端删除接口"
    mc-query-method="post">

    <!-- 查询区域 -->
    <template #query="{row, vue}">
        <mc-input v-model="row.searchKey"></mc-input>
        <el-button @click="vue.queryTable">查询</el-button>
        <el-button @click="vue.resetQueryData">重置</el-button>
    </template>

    <!-- 列定义 -->
    <mc-new-vxe-table-column title="字段" field="fieldName"></mc-new-vxe-table-column>

    <!-- 操作列 -->
    <mc-new-vxe-table-column title="操作" width="200">
        <template #row="{row, vue}">
            <el-button @click="vue.editEvent(row)">编辑</el-button>
            <el-button @click="vue.dbDelete({data:row,index:row._X_ROW_INDEX,confirm:true})">删除</el-button>
        </template>
    </mc-new-vxe-table-column>

    <!-- 编辑表单 -->
    <template #form="{row, vue}">
        <mc-input v-model="row.fieldName"></mc-input>
    </template>
</mc-new-vxe-table>
```

```javascript
var vueData = {tableList: []};
```

### 核心插槽（必须掌握）

| 插槽名 | 说明 | scope 参数 |
|--------|------|-----------|
| `#query` | 查询条件区域 | `{row, vue, query}` |
| `#operate` | 工具栏按钮区域 | `{vue, parent}` |
| `#default` | 表格列定义 | 由 vxe-table 提供 |
| `#form` | 编辑表单区域 | `{row, form, vue}` |
| `#dialog-footer` | 对话框底部按钮 | `{vue, parent, loading}` |
| `#parent` | 父子表子表区域 | `{parent, row, vue}` |

### 核心方法（通过 scope.vue 调用）

| 方法 | 说明 | 参数示例 |
|------|------|---------|
| `queryTable()` | 查询数据 | 无 |
| `resetQueryData()` | 重置查询条件 | 无 |
| `insertData({form:{}})` | 打开新增表单 | `{form:{}}` |
| `editEvent(row)` | 打开编辑表单 | 当前行对象 |
| `dbDelete({data,index,confirm})` | 删除行 | `{data:row,index:idx,confirm:true}` |
| `submitForm()` | 提交表单 | 无 |
| `closeDialog()` | 关闭对话框 | 无 |

### 常用属性

```html
<!-- 数据绑定 -->
:data.sync="tableList"           <!-- 绑定表格数据 -->

<!-- 接口配置 -->
mc-query-url="接口路径"          <!-- 查询接口 -->
mc-save-url="接口路径"           <!-- 保存接口 -->
mc-update-url="接口路径"         <!-- 更新接口 -->
mc-delete-url="接口路径"         <!-- 删除接口 -->
mc-query-method="post"           <!-- 请求方法 -->

<!-- 分页配置 -->
:mc-page-size="10"               <!-- 每页条数 -->
:mc-show-pagination="true"       <!-- 显示分页 -->

<!-- 打开方式 -->
:mc-open-pane="{'type':'drawer','width':'70%'}"  <!-- drawer 或 dialog -->

<!-- 其他 -->
height="600"                     <!-- 表格高度 -->
:auto-resize="true"              <!-- 自动调整高度 -->
:mc-show-checkbox="true"         <!-- 显示复选框 -->
:mc-show-order-no="true"        <!-- 显示序号 -->
```

### AI 使用规范

> **重要**：在编写使用 `mc-new-vxe-table` 的代码时，AI 必须：
>
> 1. ✅ 先阅读组件源码，了解完整功能
> 2. ✅ 不确定属性用法时，查看源码注释
> 3. ✅ 参考示例页面
> 4. ❌ 不要凭猜测使用属性或方法
> 5. ❌ 不要省略必需的接口配置
> 6. ❌ 不要省略 `scope.vue` 调用前缀

### 进阶功能（详见源码）

组件还支持大量进阶功能，AI 需要查看源码学习：

- **父子表**：通过 `mc-fk`、`mc-cascade`、`mc-pid-field-map` 等属性配置
- **行拖拽**：通过 `mc-drag-tr-enable` 属性启用
- **自动滚动**：通过 `mc-scroll-enable`、`mc-scroll-type` 配置
- **定时刷新**：通过 `mc-interval-seconds` 配置
- **自定义校验**：通过 `before-submit-form` 事件处理
- **数据预处理**：通过 `before-query-table`、`before-render-data` 等事件
- **多列排序**：通过 `mc-config` 配置排序规则
- **导出功能**：`exportExcel()` 方法支持导出当前页或全部数据
- **打印功能**：`printTable()` 方法支持打印选中或全部数据

> **提示**：以上仅为部分功能说明，完整功能列表和详细用法请查阅组件源码。

---

## Script.js 脚本规范

### 日志输出规范

> **重要**：在 `script.js`（API 后端脚本）中输出调试日志，必须使用 `MC.log()`，禁止使用 `console.log` / `console.error` 等 console 方法。

**正确示例**：
```javascript
MC.log("查询参数：", body)
```

**错误示例**：
```javascript
// 错误：script.js 中使用 console
console.log("查询参数：", body)
```

> **注意**：此规则仅针对 `apis/` 目录下的 `script.js` 后端脚本。`pages/` 目录下的 `page.js`（前端脚本）仍使用浏览器原生的 `console.log` / `console.error`。

### SQL 查询返回字段命名规则

> **重要**：SQL 查询返回结果时，下划线字段名会自动转换为驼峰格式。

- `warehouse_id` -> `warehouseId`
- `create_time` -> `createTime`
- `plan_id` -> `planId`

在脚本中使用这些字段时必须使用驼峰格式。

### 调用平台内部接口

> **重要**：在 script.js 中调用平台内部接口，必须使用 `api.post` 方法。

**语法格式**：
```javascript
api.post("/magical_lowcode/openapi/{projectUuid}/{apiPath}", {
    'body': { /* 请求体参数 */ }
})
```

**参数说明**：
- `{projectUuid}`：项目唯一标识符（对应 apis 目录上一级文件夹名）
- `{apiPath}`：API 路径（对应 meta.json 中的 path 字段）
- `body`：请求体参数，根据实际接口需求传递

**调用示例**：
```javascript
// 调用删除报工记录接口
api.post("/magical_lowcode/openapi/aaaabbbbccccddddeeeeffff00001111/delete-taskReport-new", {
    'body': {"ids": [1, 2, 3]}
})
```

**错误示例**：
```javascript
// 错误：使用 MC.http 方法
MC.http({
    url: "/magical_lowcode/openapi/...",
    method: "POST",
    data: JSON.stringify({...})
})
```

### 调用外部接口

> **重要**：在 script.js 中调用外部 HTTP 接口（不是平台内部的 magical_lowcode 接口），必须使用 `http.post` 方法。

**语法格式**：
```javascript
http.post({
    url: "外部接口完整URL",
    param: { /* 请求参数 */ },
    option:{readTimeout:300000,connectionTimeout:300000},
})
```

**参数说明**：
- `url`：外部接口的完整 URL 地址（包含协议、域名、端口、路径）
- `param`：请求参数对象,
- `option`：请求选项对象，可选，默认值为 `{}`。
    - `readTimeout`：读取超时时间（毫秒）
    - `connectionTimeout`：连接超时时间（毫秒）



**调用示例**：
```javascript
// 调用外部schedule接口
http.post({
    url: "http://192.0.2.10:8082/schedule/list",
    param: {"id": [1, 2, 3]}
})
```

**错误示例**：
```javascript
// 错误：使用 api.post 调用外部接口（api.post 仅用于调用平台内部接口）
api.post("http://192.0.2.10:8082/schedule/list", {
    'body': {"id": [1, 2, 3]}
})
```

### 将内部接口当作外部接口调用

> **重要**：如果 `api.post` 调用平台内部接口失效（如跨项目、跨域、权限不足等），可以使用 `http.post` 拼接完整 URL（包含 IP、端口、项目前缀）的方式来调用内部接口。

**语法格式**：
```javascript
http.post({
    url: "http://localhost:{port}/youyaboot-admin/magical_lowcode/openapi/{projectUuid}/{apiPath}",
    param: { /* 请求参数 */ }
})
```

**参数说明**：
- `localhost`：固定使用 localhost（因为调用的是平台内部接口）
- `{port}`：服务端口
- `{youyaboot-admin}`：固定管理后台路径前缀
- `{projectUuid}`：项目唯一标识符
- `{apiPath}`：API 路径

**调用示例**：
```javascript
// 调用其他项目的工作报工取消接口
http.post({
    url: "http://localhost:18080/youyaboot-admin/magical_lowcode/openapi/aaaabbbbccccddddeeeeffff00001111/work-report-cancel",
    param: {"id": [1, 2, 3]}
});
```

**适用场景**：
- 跨项目调用接口时
- `api.post` 因权限或上下文问题调用失败时
- 需要从外部系统直接触发平台内部接口时

**注意事项**：
- 因为调用的是平台内部接口，固定使用 `localhost`，无需配置 IP 和端口
- 这种调用方式绕过了内部权限校验，请谨慎使用