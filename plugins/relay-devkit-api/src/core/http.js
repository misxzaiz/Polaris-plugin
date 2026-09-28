// core/http.js — 响应内容类型判定与安全 JSON 解析。后续数据库工具的 fetch 亦复用。
export const BINARY=/^(image|audio|video|font)\/|application\/(octet-stream|pdf|zip|x-)/i;
export function tryJSON(text){ try{ return {ok:true,value:JSON.parse(text)}; }catch(e){ return {ok:false}; } }
