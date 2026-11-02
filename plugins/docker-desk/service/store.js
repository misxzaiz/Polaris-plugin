'use strict';
/**
 * store.js —— docker-desk 数据存储
 *
 * 数据边界（守死）：
 *  1. dkd.service {port, token, pid, startedAt, version} → cap.kv：面板/MCP 发现服务
 *     的唯一通道。token 只在本机 127.0.0.1 生效，与 db-workbench 同级纪律。
 *  2. 事件流水 → service 内存环形缓冲（LIMITS.EVENTS_RING 条）：**不落盘、不进 kv**。
 *  3. 日志/inspect → 纯实时管道：不落盘、不进 kv、不进任何历史。
 *     理由：容器日志与 inspect 常含敏感配置（连接串/token），落盘即扩大泄露面。
 *
 * kv 写纪律：读-改-写之间无长事务，写前重读（单用户语义，house 同款纪律）。
 */
const core = require('../shared/core');

const KV_SERVICE = 'dkd.service';

class Store {
  /**
   * @param kv {{kvGet:Function, kvSet:Function, kvDel:Function}} house kvclient 实例
   */
  constructor(kv) {
    this.kv = kv;
  }

  async publishService(info) {
    const payload = {
      port: info.port,
      token: info.token,
      pid: info.pid,
      startedAt: Date.now(),
      version: core.VERSION,
      updatedAt: Date.now(),
    };
    await this.kv.kvSet(KV_SERVICE, payload);
    return payload;
  }

  /** 心跳：面板/MCP 用 updatedAt 判断服务是否漂移/僵死 */
  async heartbeat() {
    try {
      const cur = await this.kv.kvGet(KV_SERVICE);
      if (!cur || cur.port === undefined) return;
      cur.updatedAt = Date.now();
      await this.kv.kvSet(KV_SERVICE, cur);
    } catch (_) { /* 心跳失败不致命 */ }
  }

  async unpublishService() {
    await this.kv.kvDel(KV_SERVICE).catch(() => {});
  }
}

module.exports = { Store, KV_SERVICE };
