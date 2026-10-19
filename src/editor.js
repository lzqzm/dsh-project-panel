/**
 * dsh-project-panel — 编辑器分片的源码。
 *
 * 这一份**不直接跑**，要用 esbuild 打成 `lib/client.editor.js`：
 *
 *     npm run build:editor
 *
 * 为什么要绕这一道：本插件的 client 半边是宿主 __ModuleLoader__ 下的经典 script，
 * factory 里的 require 只认种子表那 9 个说明符，CodeMirror 这种第三方代码**必须
 * 内联进 bundle**。把它单独内联成一份、按需 require.async 加载，主 bundle
 * lib/client.js 才能继续手写、改完刷新就生效。
 *
 * 注册契约（实测 dsh-client-modules 0.2.0-rc.2 的 client.js:569-581、707-742）：
 *   - id     必须是**包名**（owner）—— 宿主自己用 chunkId() 拼内部 key，写成
 *            "包名/文件名" 会被当成第二个入口，把主 bundle 顶掉。
 *   - chunk  就是文件名，必须匹配 /^client\.[A-Za-z0-9][A-Za-z0-9._-]*\.js$/。
 *   - 分片必须自包含：不能再 require 另一个相对 client*.js 产物。
 *   - 宿主按 /plugins/<包名>/client.<name>.js?rev=<rev> 现场取文件，不扫描也不预加载。
 *
 * 一个已知的取舍：esbuild 是静态打包，CM 的 import 会被提到**顶层**，也就是脚本
 * 一加载就执行，早于 factory 被调用。CM6 的包在 import 时只定义类和纯对象（不碰
 * DOM），所以安全；要是哪天它变了，症状是「点编辑时页面报错」，很容易定位。
 *
 * ———— 0.3.0 的手感改造 ————
 *
 * 宿主的明暗是**纯 CSS** 切的：`dsh-client-ui-theme/lib/index.js` 里
 * `return `${light}@media(prefers-color-scheme:dark){${dark}}`` —— 所有
 * `--dsw-alias-*` 变量在 `body` 上，深色那套包在 `@media (prefers-color-scheme: dark)`
 * 里。所以这里**不去 JS 里猜明暗**，跟着同一根线走：
 *
 *   - 界面骨架（背景、行号、选中、面板、补全列表）全部引用 `--dsw-alias-*`
 *   - 语法 token 用自建的 `--dsp-code-*`，同样用 `@media` 给两套值
 *
 * 好处是系统切深色、宿主跟着变，编辑器也立刻跟着变，不需要任何监听或重渲染。
 */
import { basicSetup } from "codemirror";
import { EditorView, keymap, scrollPastEnd } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { indentWithTab } from "@codemirror/commands";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";

/** 分片自称的版本；改动这个文件时一起改，方便在弹窗里认出旧缓存。 */
const VERSION = "0.3.1";

/** 等宽字体：优先用宿主给的 --dsw-font-mono，回落到系统栈。 */
const MONO = "var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)";

/**
 * 语法着色的两套配色。
 *
 * 只给 `:root`、不给 `.cm-*`：这些变量谁引用都行，宿主别处要是也想用可以直接拿。
 * 深色那套不追求漂亮，只要在 `--dsw-alias-bg-base` 的深底上够清楚。
 */
const TOKEN_CSS = `
:root {
	--dsp-code-comment: #7d8590;
	--dsp-code-keyword: #cf222e;
	--dsp-code-string: #0a7c42;
	--dsp-code-number: #0550ae;
	--dsp-code-function: #6639ba;
	--dsp-code-type: #953800;
	--dsp-code-property: #0550ae;
	--dsp-code-variable: #1f2328;
	--dsp-code-tag: #116329;
	--dsp-code-attribute: #0550ae;
	--dsp-code-punctuation: #57606a;
	--dsp-code-heading: #0550ae;
	--dsp-code-link: #0969da;
	--dsp-code-invalid: #cf222e;
}
@media (prefers-color-scheme: dark) {
	:root {
		--dsp-code-comment: #8b949e;
		--dsp-code-keyword: #ff7b72;
		--dsp-code-string: #a5d6a7;
		--dsp-code-number: #79c0ff;
		--dsp-code-function: #d2a8ff;
		--dsp-code-type: #ffa657;
		--dsp-code-property: #79c0ff;
		--dsp-code-variable: #e6edf3;
		--dsp-code-tag: #7ee787;
		--dsp-code-attribute: #79c0ff;
		--dsp-code-punctuation: #8b949e;
		--dsp-code-heading: #79c0ff;
		--dsp-code-link: #58a6ff;
		--dsp-code-invalid: #ff7b72;
	}
}
`;

/** 把 TOKEN_CSS 插进 <head>，只插一次（重复调用无副作用）。 */
function ensureTokenCss() {
	const marker = "dsp-editor-tokens";
	if (document.querySelector(`style[data-${marker}]`) !== null) return;
	const style = document.createElement("style");
	style.setAttribute(`data-${marker}`, "");
	style.textContent = TOKEN_CSS;
	document.head.appendChild(style);
}

/**
 * 扩展名 → 语言扩展。认不出来的（.env、.txt、无后缀…）当纯文本，不给扩展。
 * 语言包是静态 import，所以全都进了 bundle；这也意味着新增语言要重新 build。
 */
function languageFor(path) {
	const name = String(path ?? "").toLowerCase();
	const dot = name.lastIndexOf(".");
	const ext = dot < 0 ? "" : name.slice(dot + 1);
	switch (ext) {
		case "js":
		case "mjs":
		case "cjs":
		case "jsx":
			return javascript({ jsx: true });
		case "ts":
		case "tsx":
			return javascript({ jsx: true, typescript: true });
		case "json":
		case "jsonc":
			return json();
		case "html":
		case "htm":
			return html();
		case "css":
			return css();
		case "md":
		case "markdown":
			return markdown();
		case "py":
		case "pyw":
			return python();
		default:
			return [];
	}
}

/**
 * 语法 token 的颜色表。颜色本身走 CSS 变量，所以这张表是「明暗无关」的。
 */
const TOKEN_SPECS = [
	{ tag: tags.comment, color: "var(--dsp-code-comment)", fontStyle: "italic" },
	{ tag: [tags.lineComment, tags.blockComment, tags.docComment], color: "var(--dsp-code-comment)", fontStyle: "italic" },
	{ tag: [tags.keyword, tags.self, tags.controlKeyword, tags.operatorKeyword, tags.moduleKeyword, tags.definitionKeyword, tags.modifier], color: "var(--dsp-code-keyword)" },
	{ tag: [tags.string, tags.special(tags.string), tags.regexp, tags.character], color: "var(--dsp-code-string)" },
	{ tag: [tags.number, tags.bool, tags.null, tags.atom], color: "var(--dsp-code-number)" },
	{ tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.macroName], color: "var(--dsp-code-function)" },
	{ tag: [tags.definition(tags.variableName), tags.typeName, tags.className, tags.namespace], color: "var(--dsp-code-type)" },
	{ tag: [tags.propertyName, tags.attributeName, tags.definition(tags.propertyName)], color: "var(--dsp-code-property)" },
	{ tag: [tags.tagName, tags.angleBracket], color: "var(--dsp-code-tag)" },
	{ tag: [tags.attributeValue], color: "var(--dsp-code-string)" },
	{ tag: [tags.variableName, tags.labelName], color: "var(--dsp-code-variable)" },
	{ tag: [tags.operator, tags.punctuation, tags.bracket, tags.separator, tags.derefOperator], color: "var(--dsp-code-punctuation)" },
	{ tag: [tags.heading, tags.strong], color: "var(--dsp-code-heading)", fontWeight: "600" },
	{ tag: [tags.emphasis], fontStyle: "italic" },
	{ tag: [tags.link, tags.url], color: "var(--dsp-code-link)", textDecoration: "underline" },
	{ tag: [tags.invalid], color: "var(--dsp-code-invalid)", textDecoration: "underline wavy" },
	{ tag: [tags.meta, tags.annotation, tags.processingInstruction], color: "var(--dsp-code-comment)" },
];

/*
 * 防御：spec 里只要混进一个 undefined（写错 tag 名，比如把 tags.self 写成 tags.selfName），
 * HighlightStyle.define 就会在**模块顶层**抛错 —— 整个分片注册不上，浏览器只报
 * "loaded without registering"，编辑器默默退回内置文本框，很像「折叠没做」。
 * 这里统一滤一遍，写错的 tag 顶多不上色，不会再拉垮整个编辑器。
 */
for (const spec of TOKEN_SPECS) {
	if (Array.isArray(spec.tag)) {
		spec.tag = spec.tag.filter((tag) => tag !== undefined && tag !== null);
	}
}

const tokenHighlight = HighlightStyle.define(TOKEN_SPECS);

/**
 * 让编辑器融进面板。
 *
 * 骨架尽量用宿主的 `--dsw-alias-*`（背景、边框、文字、悬停底色），这样深色模式
 * 下自动是对的；只有语法 token 才用自建变量。
 */
const panelTheme = EditorView.theme({
	"&": {
		height: "100%",
		fontSize: "13px",
		backgroundColor: "transparent",
		color: "var(--dsw-alias-label-primary, inherit)",
	},
	"&.cm-focused": { outline: "none" },
	".cm-scroller": {
		fontFamily: MONO,
		lineHeight: "1.6",
		overflow: "auto",
	},
	".cm-content": {
		padding: "12px 0",
		caretColor: "var(--dsw-alias-brand-primary, #4d6bfe)",
	},
	".cm-line": { padding: "0 16px 0 8px" },
	".cm-gutters": {
		border: "none",
		backgroundColor: "transparent",
		color: "var(--dsw-alias-label-tertiary, rgba(128,128,128,.72))",
		paddingLeft: "6px",
		userSelect: "none",
	},
	".cm-activeLineGutter": {
		backgroundColor: "transparent",
		color: "var(--dsw-alias-label-primary, inherit)",
		fontWeight: "600",
	},
	".cm-activeLine": {
		backgroundColor: "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.10))",
	},
	".cm-selectionBackground, &.cm-focused .cm-selectionBackground, .cm-content ::selection": {
		backgroundColor: "var(--dsw-alias-bg-multi-select, rgba(77,107,254,.22))",
	},
	".cm-cursor, .cm-dropCursor": {
		borderLeftColor: "var(--dsw-alias-brand-primary, #4d6bfe)",
		borderLeftWidth: "2px",
	},
	".cm-matchingBracket, &.cm-focused .cm-matchingBracket": {
		backgroundColor: "var(--dsw-alias-bg-multi-select, rgba(77,107,254,.20))",
		outline: "1px solid var(--dsw-alias-brand-primary, #4d6bfe)",
	},
	".cm-nonmatchingBracket": { color: "var(--dsp-code-invalid)" },
	/* 搜索面板（Ctrl+F）—— CM 默认那套在深色底上几乎看不见，必须自己上色。 */
	".cm-panels": {
		backgroundColor: "var(--dsw-alias-bg-elevated, var(--dsw-alias-bg-base, transparent))",
		color: "var(--dsw-alias-label-primary, inherit)",
		borderTop: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.22))",
	},
	".cm-panel.cm-search": {
		padding: "8px 10px",
		fontFamily: MONO,
		fontSize: "12px",
		backgroundColor: "var(--dsw-alias-bg-elevated, var(--dsw-alias-bg-base, transparent))",
	},
	".cm-panel.cm-search input": {
		backgroundColor: "var(--dsw-alias-bg-base, transparent)",
		color: "var(--dsw-alias-label-primary, inherit)",
		border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.32))",
		borderRadius: "4px",
		padding: "3px 6px",
		fontFamily: MONO,
	},
	".cm-panel.cm-search button": {
		backgroundColor: "transparent",
		color: "var(--dsw-alias-label-secondary, rgba(128,128,128,.95))",
		border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.32))",
		borderRadius: "4px",
		padding: "2px 8px",
		cursor: "pointer",
	},
	".cm-panel.cm-search label": { color: "var(--dsw-alias-label-secondary, rgba(128,128,128,.95))" },
	".cm-searchMatch": { backgroundColor: "rgba(245,158,11,.28)", outline: "1px solid rgba(245,158,11,.55)" },
	".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "rgba(245,158,11,.55)" },
	".cm-selectionMatch": { backgroundColor: "rgba(77,107,254,.18)" },
	/* 补全 / 悬浮提示 */
	".cm-tooltip": {
		backgroundColor: "var(--dsw-alias-bg-elevated, var(--dsw-alias-bg-base, transparent))",
		border: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.22))",
		color: "var(--dsw-alias-label-primary, inherit)",
		borderRadius: "6px",
		boxShadow: "0 6px 20px rgba(0,0,0,.18)",
	},
	".cm-tooltip-autocomplete > ul > li": { padding: "2px 8px" },
	".cm-tooltip-autocomplete > ul > li[aria-selected]": {
		backgroundColor: "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.16))",
		color: "var(--dsw-alias-label-primary, inherit)",
	},
	".cm-completionLabel": { fontFamily: MONO },
	".cm-completionDetail": { color: "var(--dsw-alias-label-secondary, rgba(128,128,128,.95))" },
	/*
		折叠。`basicSetup` 里的 `foldGutter()` 已经把 `codeFolding()` 一起带上了
		（@codemirror/language 的 foldGutter 末尾就是 `codeFolding()`），所以功能一直
		都在 —— 看不见的是**标记本身**：默认 `openText: "⌄"` / `closedText: "›"`，
		而 `⌄`（U+2304）在 ui-monospace / Consolas 这类等宽字体里普遍缺字形，浏览器
		要么画豆腐块、要么干脆留白。这里把标记的字体栈换成 system-ui（有这两个字形），
		同时把颜色从行号那档 teriary 提到 secondary。
	*/
	".cm-gutter.cm-foldGutter": {
		width: "16px",
		color: "var(--dsw-alias-label-secondary, rgba(128,128,128,.92))",
	},
	".cm-foldGutter span": {
		display: "inline-block",
		minWidth: "12px",
		textAlign: "center",
		fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
		fontSize: "12px",
		lineHeight: "1",
		padding: "1px 2px",
		borderRadius: "3px",
		cursor: "pointer",
	},
	".cm-foldGutter span:hover": {
		color: "var(--dsw-alias-brand-primary, #4d6bfe)",
		backgroundColor: "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.14))",
	},
	/* 折叠后那截占位符：CM 默认 #eee 白底，深色底上像贴了张白纸。 */
	".cm-foldPlaceholder": {
		backgroundColor: "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.16))",
		border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.32))",
		color: "var(--dsw-alias-label-secondary, rgba(128,128,128,.95))",
		borderRadius: "3px",
		margin: "0 2px",
		padding: "0 4px",
		cursor: "pointer",
		fontFamily: MONO,
		fontSize: "12px",
	},
	".cm-foldPlaceholder:hover": {
		borderColor: "var(--dsw-alias-brand-primary, #4d6bfe)",
		color: "var(--dsw-alias-label-primary, inherit)",
	},
});

/**
 * 1 基行号 → 文档内光标位置。
 *
 * 行号是外面给的（搜索结果），文件可能在搜索之后被改短了，所以夹到
 * `[1, doc.lines]` —— 越界不该抛异常，顶多停在最后一行。
 */
function caretAtLine(doc, line) {
	const total = doc.lines;
	const target = Math.min(Math.max(1, Math.floor(line)), total);
	return doc.line(target).from;
}

/**
 * 把光标挪到第 `line` 行并滚到视口中间（行号 <= 0 / 非数字时什么都不做）。
 *
 * 只动 selection、不动 doc，所以不会触发 onChange —— 「跳过去看一眼」不该被
 * 记成一次编辑。
 */
function revealLine(view, line) {
	const wanted = Number(line);
	if (!Number.isFinite(wanted) || wanted <= 0) return;
	const pos = caretAtLine(view.state.doc, wanted);
	view.dispatch({
		selection: { anchor: pos },
		effects: EditorView.scrollIntoView(pos, { y: "center" }),
	});
}

/**
 * 把一个 DOM 容器变成代码编辑器。
 *
 * @param parent  挂载点（会被 CM 接管内部 DOM，调用方不要往里塞别的东西）。
 * @param options `{ path, doc, line, onChange }` —— path 决定语言，line 是打开时要
 *                落到的**1 基行号**（0/缺省 = 停在文档开头），onChange 每次改动回调。
 * @returns 一个受控句柄：`{ getValue, setValue, revealLine, focus, destroy }`。
 */
function createEditor(parent, options = {}) {
	ensureTokenCss();
	const onChange = typeof options.onChange === "function" ? options.onChange : null;
	const view = new EditorView({
		doc: typeof options.doc === "string" ? options.doc : "",
		parent,
		extensions: [
			basicSetup,
			languageFor(options.path),
			panelTheme,
			syntaxHighlighting(tokenHighlight, { fallback: true }),
			/* 缩进宽度：4 空格。不改写文件内容，只影响显示和 Tab 行为。 */
			EditorState.tabSize.of(4),
			EditorView.lineWrapping,
			/* Tab / Shift+Tab 缩进 —— basicSetup 不含这条，缺了 Tab 会跳出编辑区。 */
			keymap.of([indentWithTab]),
			/* 滚到底还能再往下留一屏空白，看文件末尾时视线不用贴着底边。 */
			scrollPastEnd(),
			EditorView.contentAttributes.of({
				spellcheck: "false",
				autocorrect: "off",
				autocapitalize: "off",
				"data-gramm": "false",
			}),
			/* 宿主面板里没有全局保存快捷键，这里只把改动交回调用方，不做落盘。 */
			EditorView.updateListener.of((update) => {
				if (update.docChanged && onChange !== null) onChange(update.state.doc.toString());
			}),
		],
	});
	revealLine(view, options.line);
	return {
		getValue: () => view.state.doc.toString(),
		setValue: (text) => {
			const next = typeof text === "string" ? text : "";
			view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
		},
		revealLine: (line) => revealLine(view, line),
		focus: () => view.focus(),
		destroy: () => view.destroy(),
	};
}

window.__ModuleLoader__.load({
	id: "dsh-project-panel",
	chunk: "client.editor.js",
	factory: () => {
		"use strict";
		return { probe: "editor-chunk-ok", version: VERSION, createEditor, languageFor };
	},
});
