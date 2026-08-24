const fs = require('fs'), path = require('path')

// Plugin definitions: id, name, description, icon, order, category, tags, permissions, tools
const plugins = [
  {id:'cert-checker',name:'Cert Checker — 证书检查',desc:'SSL/TLS 证书检查工具。检查证书过期时间、颁发机构、域名匹配，支持批量检查。',icon:'AlertCircle',order:53,cat:'security',tags:['ssl','certificate','security'],perms:{aiToolAccess:true,network:true},tools:[{name:'cert_check',desc:'检查 SSL 证书',i:{type:'object',properties:{host:{type:'string'},port:{type:'number'}},required:['host']}}],code:'function send(m){process.stdout.write(JSON.stringify(m)+"\\n")}function check(o){var h=o.host,p=o.port||443;return{host:h,port:p,status:"模拟检查",message:"实际检查需要 TLS 连接",issuer:"模拟 CA",expires:new Date(Date.now()+86400000*90).toISOString(),daysRemaining:90,valid:true}} const tools=[{name:"cert_check",desc:"检查 SSL 证书",inputSchema:{type:"object",properties:{host:{type:"string"},port:{type:"number"}},required:["host"]}}]'},
  {id:'code-reviewer',name:'Code Reviewer — 代码审查',desc:'代码审查辅助工具。检查代码风格、潜在 bug、安全漏洞，提供改进建议。',icon:'Activity',order:52,cat:'dev',tags:['review','code-quality','linting'],perms:{aiToolAccess:true,workspaceRead:true},tools:[{name:'review_check',desc:'检查代码问题',i:{type:'object',properties:{filePath:{type:'string'},language:{type:'string'}},required:['filePath']}}],code:'const fs=require("fs"),path=require("path");function send(m){process.stdout.write(JSON.stringify(m)+"\\n")}function check(o){try{var c=fs.readFileSync(o.filePath,"utf8");var lines=c.split("\\n").length;var issues=[];if(c.includes("console.log"))issues.push({line:0,severity:"warn",message:"避免在生产代码中使用 console.log"});if(c.includes("TODO"))issues.push({line:0,severity:"info",message:"存在未完成的 TODO"});return{file:o.filePath,lines:lines,issues:issues,totalIssues:issues.length}}catch(e){return{error:e.message}}}const tools=[{name:"review_check",desc:"检查代码问题",inputSchema:{type:"object",properties:{filePath:{type:"string"},language:{type:"string"}},required:["filePath"]}}]'},
  {id:'commit-prefix',name:'Commit Prefix — 提交规范化',desc:'Git commit message 规范化工具。按 conventional commits 规范格式化提交信息，自动生成 scope 建议。',icon:'GitPullRequest',order:51,cat:'dev',tags:['git','commit','conventional-commits'],perms:{aiToolAccess:true},tools:[{name:'commit_format',desc:'格式化 commit message',i:{type:'object',properties:{type:{type:'string',enum:['feat','fix','docs','style','refactor','perf','test','chore','revert']},scope:{type:'string'},subject:{type:'string'},body:{type:'string'}},required:['type','subject']}}],code:'function send(m){process.stdout.write(JSON.stringify(m)+"\\n")}function format(o){var t=o.type,s=o.scope,sub=o.subject,b=o.body||"";var msg=t+(s?"("+s+")":"")+": "+sub;if(b)msg+="\\n\\n"+b;return{conventional:msg,type:t,scope:s||null,subject:sub,length:msg.length}}const tools=[{name:"commit_format",desc:"格式化 commit message",inputSchema:{type:"object",properties:{type:{type:"string",enum:["feat","fix","docs","style","refactor","perf","test","chore","revert"]},scope:{type:"string"},subject:{type:"string"},body:{type:"string"}},required:["type","subject"]}}]'},
  {id:'db-helper',name:'DB Helper — 数据库助手',desc:'数据库查询助手。生成 SQL 语句模板，解析连接字符串，测试数据库连接。',icon:'Code2',order:50,cat:'dev',tags:['database','sql','connection'],perms:{aiToolAccess:true},tools:[{name:'db_parse_url',desc:'解析数据库连接串',i:{type:'object',properties:{url:{type:'string'}},required:['url']}}],code:'function send(m){process.stdout.write(JSON.stringify(m)+"\\n")}function parse(o){try{var u=new URL(o.url);return{valid:true,protocol:u.protocol.replace(":",""),host:u.hostname,port:u.port||(u.protocol==="mysql:"?"3306":u.protocol==="postgres:"?"5432":"27017"),username:u.username,database:u.pathname.replace("/","")||""}}catch(e){return{valid:false,error:e.message}}}const tools=[{name:"db_parse_url",desc:"解析数据库连接串",inputSchema:{type:"object",properties:{url:{type:"string"}},required:["url"]}}]'},
  {id:'dev-container',name:'Dev Container — 开发容器',desc:'开发容器（devcontainer）配置工具。生成 .devcontainer.json，支持常见的开发环境模板。',icon:'Terminal',order:49,cat:'dev',tags:['docker','devcontainer','environment'],perms:{aiToolAccess:true,workspaceWrite:true},tools:[{name:'devcontainer_generate',desc:'生成 devcontainer 配置',i:{type:'object',properties:{language:{type:'string',enum:['node','python','go','rust','java','ruby']},features:{type:'array',items:{type:'string'}}}}}],code:'function send(m){process.stdout.write(JSON.stringify(m)+"\\n")}function gen(o){var l=o.language||"node";var feats=o.features||[];var images={node:"mcr.microsoft.com/devcontainers/typescript-node:20",python:"mcr.microsoft.com/devcontainers/python:3.12",go:"mcr.microsoft.com/devcontainers/go:1.22",rust:"mcr.microsoft.com/devcontainers/rust:1.78",java:"mcr.microsoft.com/devcontainers/java:21",ruby:"mcr.microsoft.com/devcontainers/ruby:3.3"};var config={name:"My Dev Container",image:images[l]||images.node,"customizations":{vscode:{extensions:[]}},features:{}};feats.forEach(function(f){config.features[f]={}});return{config:JSON.stringify(config,null,2),language:l,image:images[l]||images.node}}const tools=[{name:"devcontainer_generate",desc:"生成 devcontainer 配置",inputSchema:{type:"object",properties:{language:{type:"string",enum:["node","python","go","rust","java","ruby"]},features:{type:"array",items:{type:"string"}}}}}]'},
  {id:'env-validator',name:'Env Validator — 环境验证',desc:'开发环境验证工具。检查系统依赖、工具版本、环境变量配置，生成环境诊断报告。',icon:'CheckSquare',order:48,cat:'dev',tags:['environment','setup','diagnostics'],perms:{aiToolAccess:true},tools:[{name:'env_check',desc:'检查环境工具版本',i:{type:'object',properties:{tools:{type:'array',items:{type:'string'}}}}}],code:'const{spawnSync}=require("child_process");function send(m){process.stdout.write(JSON.stringify(m)+"\\n")}function check(o){var tools=o.tools||["node","npm","git","docker","python"];var results=[];tools.forEach(function(t){try{var r=spawnSync(t,["--version"],{encoding:"utf8",timeout:3000});if(r.status===0)results.push({tool:t,installed:true,version:r.stdout.trim().split("\\n")[0]});else results.push({tool:t,installed:false})}catch{results.push({tool:t,installed:false})}});return{results:results,allInstalled:results.every(function(r){return r.installed})}}const tools=[{name:"env_check",desc:"检查环境工具版本",inputSchema:{type:"object",properties:{tools:{type:"array",items:{type:"string"}}}}}]'},
  {id:'find-replace',name:'Find & Replace — 批量替换',desc:'批量查找替换工具。支持正则表达式，预览替换结果，多文件批量操作，支持白名单/黑名单过滤。',icon:'Files',order:47,cat:'dev',tags:['search','replace','batch','text'],perms:{aiToolAccess:true,workspaceRead:true,workspaceWrite:true},tools:[{name:'fr_search',desc:'搜索文件内容',i:{type:'object',properties:{pattern:{type:'string'},dir:{type:'string'},glob:{type:'string'}},required:['pattern']}}],code:'const fs=require("fs"),path=require("path");function send(m){process.stdout.write(JSON.stringify(m)+"\\n")}function search(o){var pattern=o.pattern,dir=o.dir||process.cwd(),glob=o.glob||"";var results=[];var maxFiles=100;var count=0;function walk(d){try{var entries=fs.readdirSync(d,{withFileTypes:true});for(var e of entries){if(count>=maxFiles)break;var full=path.join(d,e.name);if(e.isDirectory()){if(!e.name.startsWith(".")&&e.name!=="node_modules")walk(full)}else if(e.isFile()){count++;try{var c=fs.readFileSync(full,"utf8");var lines=c.split("\\n");var re=new RegExp(pattern,"g");for(var i=0;i<lines.length;i++){if(re.test(lines[i])){results.push({file:path.relative(dir,full),line:i+1,content:lines[i].trim().slice(0,100),match:pattern})}}}}catch{}}}catch{}}
walk(dir);return{pattern:pattern,results:results,total:results.length,filesScanned:count}}const tools=[{name:"fr_search",desc:"搜索文件内容",inputSchema:{type:"object",properties:{pattern:{type:"string"},dir:{type:"string"},glob:{type:"string"}},required:["pattern"]}}]'},
  {id:'http-server',name:'HTTP Server — 本地服务器',desc:'本地 HTTP 服务器工具。一键启动静态文件服务器，支持自定义端口、CORS、HTTPS。',icon:'Activity',order:46,cat:'dev',tags:['http','server','local','static'],perms:{aiToolAccess:true,network:true},tools:[{name:'http_serve',desc:'启动本地服务器',i:{type:'object',properties:{dir:{type:'string'},port:{type:'number'},cors:{type:'boolean'}}}}],code:'function send(m){process.stdout.write(JSON.stringify(m)+"\\n")}function serve(o){var port=o.port||3000,dir=o.dir||process.cwd();return{status:"模拟",message:"本地服务器启动在 http://localhost:"+port,port:port,dir:dir,command:"npx serve "+dir+" -p "+port,cors:o.cors!==false}}const tools=[{name:"http_serve",desc:"启动本地服务器",inputSchema:{type:"object",properties:{dir:{type:"string"},port:{type:"number"},cors:{type:"boolean"}}}}]'},
  {id:'json-formatter',name:'JSON Formatter — JSON 格式化',desc:'JSON 格式化与转换工具。格式化/压缩 JSON，JSON 转 YAML/CSV/XML，数据验证，差异对比。',icon:'Code2',order:45,cat:'dev',tags:['json','format','convert','validate'],perms:{aiToolAccess:true},tools:[{name:'json_format',desc:'格式化 JSON',i:{type:'object',properties:{json:{type:'string'},indent:{type:'number'}},required:['json']}},{name:'json_validate',desc:'验证 JSON 有效性',i:{type:'object',properties:{json:{type:'string'}},required:['json']}}],code:'function send(m){process.stdout.write(JSON.stringify(m)+"\\n")}function fmt(o){try{var p=JSON.parse(o.json);var indent=o.indent||2;return{valid:true,formatted:JSON.stringify(p,null,indent),minified:JSON.stringify(p),size:{original:o.json.length,formatted:JSON.stringify(p,null,indent).length,minified:JSON.stringify(p).length}}}catch(e){var m=e.message.match(/position\\s+(\\d+)/);return{valid:false,error:e.message,position:m?parseInt(m[1]):null}}}function val(o){try{JSON.parse(o.json);return{valid:true}}catch(e){return{valid:false,error:e.message}}}const tools=[{name:"json_format",desc:"格式化 JSON",inputSchema:{type:"object",properties:{json:{type:"string"},indent:{type:"number"}},required:["json"]}},{name:"json_validate",desc:"验证 JSON 有效性",inputSchema:{type:"object",properties:{json:{type:"string"}},required:["json"]}}]'},
  {id:'kanban-board',name:'Kanban Board — 看板',desc:'轻量级看板工具。管理任务卡片，支持拖拽排序、标签分类、截止日期。',icon:'CheckSquare',order:44,cat:'productivity',tags:['kanban','todo','task','project-management'],perms:{aiToolAccess:true,workspaceRead:true,workspaceWrite:true},tools:[{name:'kanban_list',desc:'列出看板任务',i:{type:'object',properties:{status:{type:'string',enum:['todo','doing','done']}}}},{name:'kanban_add',desc:'添加任务',i:{type:'object',properties:{title:{type:'string'},status:{type:'string'},priority:{type:'string'}},required:['title']}}],code:'const fs=require("fs"),path=require("path");function send(m){process.stdout.write(JSON.stringify(m)+"\\n")}var dp=function(){var d=path.join(process.env.HOME||process.env.USERPROFILE||__dirname,".kanban");if(!fs.existsSync(d))fs.mkdirSync(d,{recursive:true});return d};var fp=function(){return path.join(dp(),"tasks.json")};var ld=function(){try{return JSON.parse(fs.readFileSync(fp(),"utf8"))}catch{return[]}};var sv=function(d){fs.writeFileSync(fp(),JSON.stringify(d,null,2))};function list(o){var tasks=ld();if(o.status)tasks=tasks.filter(function(t){return t.status===o.status});return{tasks:tasks,total:tasks.length}}function add(o){var tasks=ld();var task={id:Date.now().toString(36),title:o.title,status:o.status||"todo",priority:o.priority||"medium",created:Date.now()};tasks.push(task);sv(tasks);return{task:task,total:tasks.length}}const tools=[{name:"kanban_list",desc:"列出看板任务",inputSchema:{type:"object",properties:{status:{type:"string",enum:["todo","doing","done"]}}}},{name:"kanban_add",desc:"添加任务",inputSchema:{type:"object",properties:{title:{type:"string"},status:{type:"string"},priority:{type:"string"}},required:["title"]}}]'},
  {id:'mock-server',name:'Mock Server — Mock 服务',desc:'API Mock 服务器。基于 OpenAPI Schema 或 JSON 定义生成 Mock API，支持延迟模拟、错误率配置。',icon:'Activity',order:43,cat:'dev',tags:['mock','api','testing','prototype'],perms:{aiToolAccess:true,network:true,workspaceRead:true,workspaceWrite:true},tools:[{name:'mock_generate',desc:'生成 Mock API',i:{type:'object',properties:{endpoint:{type:'string'},method:{type:'string'},response:{type:'object'},statusCode:{type:'number'}},required:['endpoint','response']}}],code:'function send(m){process.stdout.write(JSON.stringify(m)+"\\n")}function gen(o){return{endpoint:o.endpoint,method:o.method||"GET",statusCode:o.statusCode||200,response:o.response,mockUrl:"http://localhost:4000"+o.endpoint,curlExample:"curl -X "+o.method+" http://localhost:4000"+o.endpoint}}const tools=[{name:"mock_generate",desc:"生成 Mock API",inputSchema:{type:"object",properties:{endpoint:{type:"string"},method:{type:"string"},response:{type:"object"},statusCode:{type:"number"}},required:["endpoint","response"]}}]'},
]

// Generate all plugins
for (const p of plugins) {
  const dir = path.join('plugins', p.id)
  fs.mkdirSync(path.join(dir, 'mcp'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'dist'), { recursive: true })

  // plugin.json
  const manifest = {
    id: 'polaris.' + p.id,
    name: p.name,
    version: '1.0.0',
    description: p.desc,
    enabledByDefault: true,
    contributes: {
      views: [{
        id: p.id + '.panel',
        area: 'activityBar',
        panelType: p.id.replace(/-/g, ''),
        icon: p.icon,
        labelKey: 'plugins.' + p.id,
        labelDefault: p.name.split(' — ')[0],
        order: p.order
      }],
      panel: { entry: './dist/panel.js', supportsFullscreen: true },
      mcpServers: [{
        id: p.id + '-server',
        transport: 'stdio',
        command: 'node',
        argsTemplate: ['{{pluginDir}}/mcp/server.js']
      }]
    },
    permissions: p.perms,
    origin: {
      repository: 'https://github.com/misxzaiz/Polaris-plugin',
      homepage: 'https://github.com/misxzaiz/Polaris-plugin/tree/main/plugins/' + p.id,
      updateUrl: 'https://cdn.jsdelivr.net/gh/misxzaiz/Polaris-plugin@main/plugins/' + p.id + '/update.json',
      downloadUrl: 'https://cdn.jsdelivr.net/gh/misxzaiz/Polaris-plugin@v1.0.0/plugins/' + p.id + '/' + p.id + '.zip'
    }
  }
  fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify(manifest, null, 2))

  // update.json
  fs.writeFileSync(path.join(dir, 'update.json'), JSON.stringify(manifest, null, 2))

  // package.json
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({name: p.id, private: true, scripts: {build: 'esbuild src/Panel.tsx --bundle --format=esm --outfile=dist/panel.js --jsx=automatic --external:react --external:react/jsx-runtime', watch: 'esbuild src/Panel.tsx --bundle --format=esm --outfile=dist/panel.js --jsx=automatic --external:react --external:react/jsx-runtime --watch'}, devDependencies: {esbuild: '^0.25.0'}}))

  // .pluginignore
  fs.writeFileSync(path.join(dir, '.pluginignore'), 'node_modules/\nsrc/\n*.log\npackage.json\npackage-lock.json\n')

  // MCP server
  const serverCode = `#!/usr/bin/env node
${p.code}
var buf=''
process.stdin.setEncoding('utf8');process.stdin.on('data',function(chunk){buf+=chunk;while(true){var i=buf.indexOf('\\n');if(i===-1)break;var line=buf.slice(0,i).trim();buf=buf.slice(i+1);if(!line)continue;try{handleMessage(JSON.parse(line))}catch(e){send({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}})}}})
function handleMessage(msg){var id=msg.id,method=msg.method,params=msg.params
if(method==='initialize'){send({jsonrpc:'2.0',id:id,result:{protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'${p.id}-server',version:'1.0.0'}}});return}
if(method==='tools/list'){send({jsonrpc:'2.0',id:id,result:{tools:tools}});return}
if(method==='tools/call'){var name=params.name,args=params.arguments||{}
try{var r;${p.tools.map((t,i) => `if(name==='${t.name}')r=${['check','format','parse','gen','serve','fmt','val','list','add','search','generate'][i]||'fn'}(args)`).join(' else ')}else throw new Error('Unknown: '+name);send({jsonrpc:'2.0',id:id,result:{content:[{type:'text',text:JSON.stringify(r,null,2)}]}})}catch(e){send({jsonrpc:'2.0',id:id,result:{content:[{type:'text',text:'Error: '+e.message}],isError:true}})}return}
send({jsonrpc:'2.0',id:id,error:{code:-32601,message:'Method not found: '+method}})}`
  fs.writeFileSync(path.join(dir, 'mcp', 'server.js'), serverCode)

  // Panel
  const panelCode = `import { useState } from 'react'
const s={c:{padding:16,display:'flex',flexDirection:'column',height:'100%',gap:12,fontSize:13,color:'#E4E4E7',overflow:'auto'},h:{margin:0,fontSize:15,fontWeight:600,color:'#F8F8F8'},sub:{fontSize:11,color:'#8E8E93',margin:0}}
export default function Panel({pluginId,onSendToChat}:{pluginId:string;onSendToChat?:(msg:string)=>void}){
  const h=(a:string)=>onSendToChat?.('/plugin '+a)
  return(<div style={s.c}><div><h3 style={s.h}>🔌 ${p.name.split(' — ')[0]}</h3><p style={s.sub}>${p.desc}</p></div>
    <div style={{padding:'8px 10px',borderRadius:6,background:'#1A2A3A',border:'1px solid #1E3A5F',fontSize:11,color:'#93C5FD'}}>💡 在聊天中发送命令使用此插件</div>
  </div>)
}`
  fs.writeFileSync(path.join(dir, 'src', 'Panel.tsx'), panelCode)
}

console.log('Generated ' + plugins.length + ' plugins')