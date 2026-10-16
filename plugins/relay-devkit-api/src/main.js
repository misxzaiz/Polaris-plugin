// src/main.js — 组装入口（relay-devkit-api：仅 API 客户端）。
// 配置 view-host、注册 api 视图、初始化 API、启动路由。
// 请求经宿主 cap.http 能力转发（零本地服务），不启动任何 node 服务。
import { registerView, startRouter } from './core/router.js';
import { configureViewHost } from './core/json-view.js';
import { initApi, persist, renderRespBody } from './tools/api.js';

// core 的表格渲染（列宽拖拽/多表格切换）回调到 API 的持久化与当前响应重渲染
configureViewHost({ persist, rerender: renderRespBody });

// 视图注册表：顺序即顶栏顺序。api 常驻。
registerView({ id: 'api', label: 'API 请求', icon: '⇅' });

initApi();
startRouter();
