// src/main.js — 组装入口：配置 view-host、注册视图、初始化 API、启动路由。
import { registerView, startRouter } from './core/router.js';
import { configureViewHost } from './core/json-view.js';
import { initApi, persist, renderRespBody } from './tools/api.js';
import { initJsonTool } from './tools/json.js';
import { initSqlTool } from './tools/sql.js';
import { initTimeTool } from './tools/time.js';
import { initDbTool } from './tools/db.js';
import { initAiTool } from './tools/ai.js';
import { initAiFloat } from './components/ai-float.js';

// core 的表格渲染（列宽拖拽/多表格切换）回调到 API 的持久化与当前响应重渲染
configureViewHost({ persist, rerender: renderRespBody });

// 视图注册表：顺序即顶栏与首页卡片顺序。home/api 常驻；其余懒初始化。
registerView({ id:'home', label:'首页', icon:'⌂' });
registerView({ id:'api', label:'API 请求', icon:'⇅',
  card:{ name:'API 请求', icon:'⇅', accent:'var(--brand)', desc:'多 tab、环境变量、cURL 导入、跨域代理；响应支持表格 / 对象树 / 路径下钻与筛选。' } });
registerView({ id:'json', label:'JSON', icon:'{ }', init:initJsonTool,
  card:{ name:'JSON 工具', icon:'{ }', accent:'var(--m-post)', desc:'粘贴即用：格式化 / 压缩 / 校验 / 转义；对象树、表格、路径下钻、字段筛选，识别图片与时间戳。' } });
registerView({ id:'sql', label:'SQL', icon:'≡', init:initSqlTool,
  card:{ name:'SQL 模板填充', icon:'≡', accent:'var(--m-put)', desc:'预编译 ? + 参数还原为可执行 SQL；自动判断类型、转义引号；支持 MyBatis 日志 Preparing/Parameters 解析。' } });
registerView({ id:'time', label:'时间戳', icon:'◷', init:initTimeTool,
  card:{ name:'时间戳转换', icon:'◷', accent:'var(--m-patch)', desc:'秒 / 毫秒 / 微秒自动识别，epoch ↔ 本地 / UTC / ISO / 相对时间，双向互转，一键复制。' } });
registerView({ id:'db', label:'数据库', icon:'⛁', init:initDbTool,
  card:{ name:'数据库', icon:'⛁', accent:'#2dd4bf', desc:'MySQL（经后端桥接）与 Supabase（浏览器原生 REST）统一一处；表浏览、SQL/过滤查询、全 CRUD 走预览-确认-执行。' } });
registerView({ id:'ai', label:'AI', icon:'✦', init:initAiTool,
  card:{ name:'AI 助手', icon:'✦', accent:'var(--m-patch)', desc:'接入 OpenAI 协议 AI，分析 API 错误、优化 SQL、生成查询，浮窗随时唤出。' } });

initApi();
startRouter();
initAiFloat();
