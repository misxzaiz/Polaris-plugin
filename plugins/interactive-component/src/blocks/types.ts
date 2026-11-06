/**
 * 块协议类型（本地副本）
 *
 * 从宿主 src/types/chat.ts 冻结快照（plugin-ui-contribution-spec [R-2]：
 * 协议冻结面，插件只消费不扩展）。宿主侧变更须走宿主协议 spec 并同步本副本。
 */

export type FormFieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'textarea'
  | 'select'
  | 'secret'
  | 'date'
  | 'time'
  | 'datetime'
  | 'month'
  | 'week';

export interface FormFieldSchema {
  name: string;
  type?: FormFieldType;
  label?: string;
  placeholder?: string;
  /** select 字段的可选项（type=select 必需） */
  options?: string[];
  /** 是否必填 */
  required?: boolean;
  /** 默认值 */
  default?: string | number | boolean;
  /** secret 字段：值在服务端强制掩码，AI 上下文与前端回执都不可见原文 */
  secret?: boolean;
  /** 隐藏字段：值仍参与转发/回喂，但回执中显示为 <已隐藏>（信任边界由服务端强制） */
  hidden?: boolean;
  /** 栅格跨列（style.gridCols 布局下，1-4） */
  col?: 1 | 2 | 3 | 4;
}

export interface FormBlock {
  type: 'form';
  /** 表单 ID（与 form_submit 的 formId 对应） */
  id: string;
  /** 后端/路由会话 ID */
  sessionId?: string;
  /** 表单标题 */
  title?: string;
  /** read 模式：full=AI 可见字段值；none=仅字段名（值不写入 DOM） */
  read: 'full' | 'none';
  /** 目标能力（付给 form_submit）；collect 模式无目标，可为空 */
  target: string;
  /** 目标动作；collect 模式无动作，可为空 */
  action: string;
  /** 表单模式：dispatch（默认，转发目标能力）/ collect（仅收集参数，不转发） */
  mode: 'dispatch' | 'collect';
  /** AI 声明的样式（accent/bg/gridCols/gap/radius），前端按白名单键应用 */
  style?: Record<string, string | number>;
  /** 模板引用（name/version），显示「来自模板 X」 */
  template?: { name: string; version?: string };
  /** 字段 schema（前端渲染控件） */
  fields: FormFieldSchema[];
  /** 提交状态 */
  status: 'pending' | 'submitted' | 'skipped';
  /** 服务端回执（read=none 时不含字段值） */
  receipt?: string;
  /** 提交是否成功 */
  ok?: boolean;
  /** 创建时间（ISO 8601） */
  createdAt: string;
}

export type QuestionStatus = 'pending' | 'answered';

export interface QuestionOption {
  /** 选项值 */
  value: string;
  /** 显示文本（可选，默认使用 value） */
  label?: string;
  /** 选项描述（可选） */
  description?: string;
  /** 预览文本（可选，展示示例） */
  preview?: string;
}

export interface SubAnswer {
  /** 选中的选项值（按 label 文本对齐） */
  selected: string[];
  /** 自定义输入 */
  customInput?: string;
  /** 该题是否被单独跳过（部分跳过场景） */
  declined?: boolean;
}

export interface QuestionItem {
  /** 完整问题文本（卡片正文） */
  question: string;
  /** 短标签（≤12 字，类别 chip） */
  header: string;
  /** 是否多选 */
  multiSelect?: boolean;
  /** 选项列表 */
  options: QuestionOption[];
  /** 是否允许自定义输入 */
  allowCustomInput?: boolean;
}

export interface QuestionBlock {
  type: 'question';
  /** 工具调用 ID（与 tool_call_start 的 callId 对应） */
  id: string;
  /** 后端/路由会话 ID，用于提交答案和 question_answered 事件回路 */
  sessionId?: string;
  /** 同一 call 内的全部问题（新版主字段） */
  questions: QuestionItem[];
  /** 回答状态 */
  status: QuestionStatus;
  /** 每题答案数组（新版） */
  answers?: SubAnswer[];
  /** 是否整体被跳过 */
  declined?: boolean;
  /** @deprecated 旧字段：问题标题（首题摘要） */
  header?: string;
  /** @deprecated 旧字段：类别标签 */
  categoryLabel?: string;
  /** @deprecated 旧字段：是否多选 */
  multiSelect?: boolean;
  /** @deprecated 旧字段：单题选项 */
  options?: QuestionOption[];
  /** @deprecated 旧字段：是否允许自定义输入 */
  allowCustomInput?: boolean;
  /** @deprecated 旧字段：单题答案 */
  answer?: SubAnswer;
  /** 创建时间 */
  createdAt?: string;
}

/** 块委托渲染 props（宿主 BlockDelegation 注入；spec [R-9]） */
export interface BlockRendererProps<T> {
  block: T
  /** 块补丁写入（宿主实现——语义层 store 写入留在宿主） */
  updateBlock: (patch: Record<string, unknown>) => void
}
