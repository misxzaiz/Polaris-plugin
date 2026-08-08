// core/ai-client.js — OpenAI protocol client: SSE streaming + Function Calling loop + lightweight Markdown.
// Zero-dependency; uses fetch + ReadableStream for streaming.

import { chatUrl, getActive } from "./ai-store.js";
import { buildSystemPrompt, buildTools, executeToolCall } from "./ai-context.js";

const MAX_TOOL_ROUNDS = 5;

/* ===================== SSE Stream Parser ===================== */

function createSSEParser() {
  let buffer = "";
  return {
    feed(chunk) {
      buffer += chunk;
      const results = [];
      while (true) {
        const idx = buffer.indexOf("\n");
        if (idx < 0) break;
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") { results.push({ done: true }); continue; }
          try {
            const json = JSON.parse(data);
            results.push(json);
          } catch(e) { /* skip malformed JSON */ }
        }
      }
      return results;
    },
    reset() { buffer = ""; }
  };
}

/* ===================== Core Chat Function ===================== */

/**
 * Send a chat message and handle streaming response + tool calls.
 * @param {Object} opts
 * @param {Array} opts.messages - conversation messages
 * @param {Function} opts.onDelta - called with text delta as it streams
 * @param {Function} opts.onToolCall - called when AI invokes a tool {name, arguments}
 * @param {Function} opts.onToolResult - called with tool execution result
 * @param {Function} opts.onComplete - called with full response text when done
 * @param {Function} opts.onError - called with error message
 * @param {AbortSignal} opts.signal - optional AbortController signal
 * @param {boolean} opts.useContext - whether to inject system prompt context (default true)
 */
export async function chat(opts) {
  const config = getActive();
  if (!config || !config.endpoint || !config.apiKey) {
    if (opts.onError) opts.onError("请先配置 AI（点击右上角设置或 /#/ai）");
    return;
  }

  const url = chatUrl(config.endpoint);
  const tools = buildTools();
  const systemPrompt = opts.useContext !== false ? buildSystemPrompt() : "你是 RELAY DevKit 的 AI 助手。";

  // Build messages array with system prompt
  const allMessages = [{ role: "system", content: systemPrompt }, ...opts.messages];

  // Build request body
  const body = {
    model: config.model || "gpt-3.5-turbo",
    messages: allMessages,
    temperature: config.temperature ?? 0.7,
    max_tokens: config.maxTokens || 4096,
    stream: true,
  };
  if (tools.length) body.tools = tools;

  // Custom system prompt from config
  if (config.systemPrompt && config.systemPrompt.trim()) {
    allMessages[0].content += "\n\n" + config.systemPrompt.trim();
  }

  // Execute with streaming, handle tool calls in loop
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    body.messages = allMessages;
    let fullText = "";
    let toolCalls = [];

    try {
      const headers = { "Content-Type": "application/json", "Authorization": "Bearer " + config.apiKey };
      let fetchUrl = url;

      // Proxy support: route through /__proxy if config.proxy is true
      if (config.proxy) {
        headers["X-Relay-Target"] = url;
        fetchUrl = "/__proxy";
      }

      const resp = await fetch(fetchUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: opts.signal,
      });

      if (!resp.ok) {
        let errMsg = "HTTP " + resp.status;
        try { const errData = await resp.json(); errMsg = errData.error?.message || errData.message || errMsg; } catch(e) {}
        if (opts.onError) opts.onError(errMsg);
        return;
      }

      // Parse SSE stream
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      const parser = createSSEParser();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunks = parser.feed(decoder.decode(value, { stream: true }));
        for (const chunk of chunks) {
          if (chunk.done) continue;
          const delta = chunk.choices && chunk.choices[0] && chunk.choices[0].delta;
          if (!delta) continue;
          // Text content
          if (delta.content) {
            fullText += delta.content;
            if (opts.onDelta) opts.onDelta(delta.content);
          }
          // Tool calls
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index || 0;
              if (!toolCalls[idx]) toolCalls[idx] = { id: "", name: "", arguments: "" };
              if (tc.id) toolCalls[idx].id = tc.id;
              if (tc.function) {
                if (tc.function.name) toolCalls[idx].name += tc.function.name;
                if (tc.function.arguments) toolCalls[idx].arguments += tc.function.arguments;
              }
            }
          }
        }
      }
    } catch(e) {
      if (e.name === "AbortError") return;
      if (opts.onError) opts.onError("请求失败：" + e.message);
      return;
    }

    // No tool calls — we are done
    if (!toolCalls.length) {
      if (opts.onComplete) opts.onComplete(fullText);
      return;
    }

    // Append assistant message with tool_calls to history
    allMessages.push({ role: "assistant", content: fullText || null, tool_calls: toolCalls });

    // Execute each tool call and append results
    for (const tc of toolCalls) {
      if (opts.onToolCall) opts.onToolCall(tc.name, tc.arguments);
      let args = {};
      try { args = JSON.parse(tc.arguments || "{}"); } catch(e) {}
      const result = await executeToolCall(tc.name, args);
      if (opts.onToolResult) opts.onToolResult(tc.name, result);
      allMessages.push({ role: "tool", tool_call_id: tc.id, content: result });
    }
    // Loop continues — next round will send updated messages
  }

  // Reached max tool rounds
  if (opts.onComplete) opts.onComplete("");
}

/* ===================== Non-streaming chat (for simple queries) ===================== */

export async function chatSync(opts) {
  const config = getActive();
  if (!config || !config.endpoint || !config.apiKey) return null;
  const url = chatUrl(config.endpoint);
  const tools = buildTools();
  const systemPrompt = opts.useContext !== false ? buildSystemPrompt() : "你是 RELAY DevKit 的 AI 助手。";
  const allMessages = [{ role: "system", content: systemPrompt }, ...opts.messages];
  const body = { model: config.model || "gpt-3.5-turbo", messages: allMessages, temperature: config.temperature ?? 0.7, max_tokens: config.maxTokens || 4096 };
  if (tools.length) body.tools = tools;
  if (config.systemPrompt && config.systemPrompt.trim()) allMessages[0].content += "\n\n" + config.systemPrompt.trim();
  const headers = { "Content-Type": "application/json", "Authorization": "Bearer " + config.apiKey };
  let fetchUrl = url;
  if (config.proxy) { headers["X-Relay-Target"] = url; fetchUrl = "/__proxy"; }
  try {
    const resp = await fetch(fetchUrl, { method: "POST", headers, body: JSON.stringify(body), signal: opts.signal });
    if (!resp.ok) return { error: "HTTP " + resp.status };
    return await resp.json();
  } catch(e) { return { error: e.message }; }
}

/* ===================== Lightweight Markdown Renderer ===================== */
// Handles: code blocks, bold, inline code, lists, paragraphs, line breaks

export function renderMarkdown(text) {
  if (!text) return "";
  // Escape HTML
  let html = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Code blocks: ```lang\n...\n```
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, function(_, lang, code) {
    return "<pre class=\"ai-code-block\"><code" + (lang ? " class=\"lang-" + lang + "\"" : "") + ">" + code + "</code></pre>";
  });

  // Inline code: `...`
  html = html.replace(/`([^`]+)`/g, "<code class=\"ai-code-inline\">$1</code>");

  // Bold: **...**
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Unordered lists: lines starting with - or *
  html = html.replace(/^[-*] (.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>[\s\S]*?<\/li>\n?)+/g, "<ul>$&</ul>");

  // Numbered lists: 1. 2. etc
  html = html.replace(/^\d+\.\s(.+)$/gm, "<li>$1</li>");

  // Line breaks: double newline = paragraph, single newline = <br>
  html = html.replace(/\n\n/g, "</p><p>");
  html = html.replace(/\n/g, "<br>");
  html = "<p>" + html + "</p>";

  // Clean up empty paragraphs
  html = html.replace(/<p><\/p>/g, "");

  return html;
}
