import React from 'react';
import Panel from './Panel';

/**
 * 数据查询台面板入口（house 约定：default export，props { pluginId, onSendToChat }）
 */
export default function index(props: { pluginId: string; onSendToChat?: (text: string) => void }) {
  return <Panel {...props} />;
}
