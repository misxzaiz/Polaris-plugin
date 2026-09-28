// src/main.js — 组装入口（relay-devkit-api：仅 API 客户端）。
// 配置 view-host、注册 home/api 视图、初始化 API、启动路由。
// 请求经宿主 cap.http 能力转发（零本地服务），不启动任何 node 服务。
import { registerView, startRouter } from './core/router.js';
import { configureViewHost } from './core/json-view.js';
import { initApi, persist, renderRespBody } from './tools/api.js';

// core 的表格渲染（列宽拖拽/多表格切换）回调到 API 的持久化与当前响应重渲染
configureViewHost({ persist, rerender: renderRespBody });

// 视图注册表：顺序即顶栏与首页卡片顺序。home/api 常驻。
registerView({ id: 'home', label: '首页', icon: '⌂' });
registerView({ id: 'api', label: 'API 请求', icon: '⇅',
  card: { name: 'API 请求', icon: '⇅', accent: 'var(--brand)', desc: '多 tab、环境变量、cURL 导入、宿主 cap.http 跨域转发；响应支持表格 / 对象树 / 路径下钻与筛选。' } });

initApi();
startRouter();
