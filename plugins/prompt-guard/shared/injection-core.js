'use strict';
/**
 * injection-core.js —— 防注入检查器共享核心（单一权威，零依赖纯函数、零 node 内置模块）
 *
 * 被 MCP server（CJS require）与面板（esbuild 打包进 browser bundle）共用，
 * 禁止 require 任何 node 内置模块（exec-sandbox 实证坑）。
 *
 * 检测语义（如实）：
 *   - 纯规则 + 启发式（正则 + 权重 + 编码解码 + 不可见字符扫描），无 LLM 语义级
 *     检测——能拦常见已知模式，不能替代语义判断；报告如实标注局限。
 *   - 只检测不阻断：调用方自行决定是否把文本喂给模型。
 *   - 报告脱敏：findings 只含命中片段截断预览（≤60 字符），不含原文全文。
 *
 * 分级：score = 命中规则权重之和 × 类别频次封顶；0=clean，1-2=suspicious，>=3=dangerous。
 */

// ── 规则集（中英双语；weight 1=弱信号 2=中 3=强）─────────────────────────────
const RULES = [
  {
    id: 'override', category: '指令覆盖', weight: 3,
    pattern: /(?:ignore|disregard|forget)[\s\S]{0,30}(?:previous|prior|above|earlier|all)[\s\S]{0,20}(?:instruction|prompt|rule|direction)|忽略(?:之前|以上|上述|前面)[\s\S]{0,6}(?:指令|提示|规则|内容)|无视(?:上述|以上|之前|系统)|把?(?:之前|以上|上述)(?:的)?(?:指令|规则|设定)[\s\S]{0,6}(?:忽略|无视|清除)/i,
    desc: '要求模型无视先前指令——prompt injection 最典型开场',
  },
  {
    id: 'role-hijack', category: '角色劫持', weight: 3,
    pattern: /(?:you are now|from now on you are|act as|pretend to be|new persona)[\s\S]{0,40}(?:a|an|the)?[\s\S]{0,30}(?:different|new|unrestricted|jailbreak|DAN)|从现在起你是|你现在是一个|请扮演|假装你是|换个身份/i,
    desc: '试图改写模型角色设定',
  },
  {
    id: 'system-probe', category: '系统提示词探测', weight: 3,
    // 探测类不做语序假设：「系统提示词」词组与「输出类动词」同文即算（词组本身出现已值得标记）
    pattern: /(?:reveal|print|show|repeat|output|display)[\s\S]{0,25}(?:your )?(?:system prompt|initial instruction|hidden prompt|rules above)|系统提示词?[\s\S]{0,12}(?:输出|打印|显示|复述|重复|泄露|原样|给我看|发我)|泄露(?:你的)?(?:系统提示|设定)|你的(?:初始指令|隐藏指令|系统设定)/i,
    desc: '探测/套取系统提示词',
  },
  {
    id: 'tool-induction', category: '工具调用诱导', weight: 2,
    pattern: /(?:call|invoke|use|run|execute)[\s\S]{0,30}(?:the )?[\w-]*tool|调用(?:工具|函数)|执行(?:命令|以下命令|该命令)|运行(?:此|该|以下)(?:命令|脚本)/i,
    desc: '诱导模型调用工具/执行命令',
  },
  {
    id: 'exfil-instruction', category: '数据外泄指令', weight: 3,
    pattern: /(?:send|post|upload|export|forward|email)[\s\S]{0,40}(?:https?:\/\/|to\s+[\w.-]+@)|(?:发送|上传|导出|转发)(?:到|至|给)[\s\S]{0,30}(?:https?:\/\/|网址|邮箱|服务器)|访问.{0,20}https?:\/\/[\w.-]+\.[a-z]{2,}\/\?[\w=]/i,
    desc: '指示把上下文/数据发往外部地址',
  },
  {
    id: 'jailbreak', category: '越狱模式', weight: 3,
    pattern: /\bDAN\b|developer mode[\s\S]{0,20}(?:enabled|on|activated)|jailbreak|AIM:|OpenAI.{0,10}policy.{0,20}(?:ignore|bypass)|越狱|开发者模式(?:已|已启用|开启)/i,
    desc: '知名越狱框架/开发者模式伪造',
  },
  {
    id: 'tag-injection', category: '标签/分隔符注入', weight: 2,
    pattern: /<\/?(?:system|assistant|user|tool|function[_-]results?)>|\[SYSTEM\]|\[INST\]|^#{2,5}\s*(?:system|instructions?|rules?)\s*$|\b={3,}\b[\s\S]{0,40}(?:instruction|rule|命令|规则)/im,
    desc: '伪造系统/对话标签或分隔符块',
  },
  {
    id: 'fake-system', category: 'System 冒充', weight: 2,
    pattern: /(?:^|\n)\s*(?:System|SYSTEM|系统)\s*[:：]|<\|?(?:im_start|im_end|system)\|?>/m,
    desc: '冒充 System 消息边界',
  },
  {
    id: 'context-drain', category: '上下文窃取', weight: 2,
    // 双向语序：动词在前（Summarize everything above）与宾语在前（把以上内容复述）都覆盖
    pattern: /(?:summarize|repeat|output|paste|copy)[\s\S]{0,30}(?:everything|all text|the entire|whole conversation|above)|把?以上(?:全部)?[\s\S]{0,6}(?:内容|对话|文本|说的)[\s\S]{0,10}(?:复述|总结|输出|粘贴|重复)|(?:复述|总结|输出|粘贴)(?:一遍)?(?:我们刚才|以上|上面)(?:说|聊)?(?:的)?(?:全部)?(?:内容|对话)/i,
    desc: '诱导倾倒全部上下文',
  },
  {
    id: 'step-chain', category: '多步诱导链', weight: 2,
    pattern: /(?:step\s*1|first)[\s\S]{0,60}(?:ignore|disregard|bypass)[\s\S]{0,60}(?:step\s*2|then|next)|(?:首先|第一步)[\s\S]{0,40}(?:忽略|无视|绕过)[\s\S]{0,40}(?:然后|第二步|接着)/i,
    desc: '分步忽略-执行诱导链',
  },
  {
    id: 'sensitive-cmd', category: '危险操作诱导', weight: 2,
    pattern: /(?:delete|remove|format|wipe|shutdown|disable)[\s\S]{0,25}(?:all files|disk|firewall|database|folder)|(?:删除|格式化|清空|关闭|停用)(?:所有文件|磁盘|防火墙|数据库|全部数据|系统)/i,
    desc: '诱导生成危险系统操作',
  },
  {
    id: 'codefence-escape', category: '代码块逃逸', weight: 1,
    pattern: /```[\s\S]{0,200}```\s*(?:[^`\n]{0,20}(?:instruction|ignore|execute|run|调用|执行|忽略))/i,
    desc: '代码块闭合后紧跟指令',
  },
  {
    id: 'policy-poke', category: '政策试探', weight: 1,
    pattern: /(?:what are your|list your)[\s\S]{0,20}(?:rules|restrictions|limitations|policies)|你(?:有)?(?:什么)?(?:限制|规则|底线|原则)/i,
    desc: '试探模型限制边界（弱信号）',
  },
  {
    id: 'payload-b64', category: '编码载荷', weight: 2,
    pattern: /[A-Za-z0-9+/=]{60,}(?:\.[A-Za-z0-9+/=]{20,})?/,
    desc: '长 base64/hex 块——可疑编码载荷（需结合上下文判断）',
  },
  {
    id: 'invisible-chars', category: '不可见字符', weight: 2,
    pattern: /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/,
    desc: '零宽/双向控制字符——隐藏指令与文本混淆常用载体',
  },
];

/** 分级阈值 */
const LEVELS = { clean: 0, suspicious: 1, dangerous: 3 };

/** 命中片段预览上限（脱敏截断） */
const PREVIEW_CAP = 60;

/**
 * 检测文本（纯函数，单测覆盖）。
 * @param {string} text 待检文本
 * @returns {{ level:'clean'|'suspicious'|'dangerous', score:number, findings:Array, ruleCount:number }}
 *   findings: [{ ruleId, category, weight, count, preview }]（preview 为首个命中片段截断）
 */
function checkText(text) {
  const raw = String(text == null ? '' : text);
  const findings = [];
  let score = 0;
  for (const rule of RULES) {
    let count = 0;
    let first = '';
    if (rule.id === 'invisible-chars') {
      // 不可见字符逐字符统计
      const matches = raw.match(new RegExp(rule.pattern.source, 'g')) || [];
      count = matches.length;
      if (count > 0) first = matches.slice(0, 5).map((c) => 'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')).join(' ');
    } else {
      const re = new RegExp(rule.pattern.source, rule.pattern.flags.includes('g') ? rule.pattern.flags : rule.pattern.flags + 'g');
      const matches = raw.match(re);
      count = matches ? matches.length : 0;
      if (count > 0) first = matches[0];
    }
    if (count > 0) {
      score += rule.weight * Math.min(count, 3); // 频次封顶 3，防刷分
      findings.push({
        ruleId: rule.id,
        category: rule.category,
        weight: rule.weight,
        count,
        preview: truncate(String(first).replace(/\s+/g, ' ').trim(), PREVIEW_CAP),
      });
    }
  }
  findings.sort((a, b) => b.weight * b.count - a.weight * a.count);
  const level = score >= LEVELS.dangerous ? 'dangerous' : score >= LEVELS.suspicious ? 'suspicious' : 'clean';
  return { level, score, findings, ruleCount: RULES.length };
}

/** 检测规则清单（供 check_patterns / 面板展示；不含 pattern 原文——报告面收敛） */
function listRules() {
  return RULES.map((r) => ({ id: r.id, category: r.category, weight: r.weight, desc: r.desc }));
}

function truncate(s, cap) {
  return s.length <= cap ? s : s.slice(0, cap) + '…';
}

/** 分级说明（报告统一口径） */
function levelLabel(level) {
  return level === 'dangerous' ? '危险' : level === 'suspicious' ? '可疑' : '干净';
}

module.exports = {
  RULES, LEVELS, PREVIEW_CAP,
  checkText, listRules, truncate, levelLabel,
};
