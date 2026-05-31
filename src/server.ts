import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { AgentRunner, defaultAgentConfig } from "./agent/runner.js";
import { SkillManager } from "./skill.js";
import { getConfig } from "./config.js";

const HTML_PAGE = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>OpenCode Advanced UI</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #0d1117; color: #e6edf3; height: 100vh; display: flex; flex-direction: column;
  }
  header {
    padding: 16px 24px; border-bottom: 1px solid #30363d; background: #161b22;
    display: flex; align-items: center; gap: 12px;
  }
  header h1 { font-size: 18px; font-weight: 600; color: #58a6ff; }
  header span { color: #8b949e; font-size: 13px; }
  #status { margin-left: auto; font-size: 12px; padding: 4px 10px; border-radius: 12px; background: #21262d; color: #8b949e; }
  #status.online { background: #1b3623; color: #3fb950; }
  #chat { flex: 1; overflow-y: auto; padding: 24px; display: flex; flex-direction: column; gap: 16px; }
  .msg { max-width: 80%; padding: 12px 16px; border-radius: 12px; line-height: 1.5; font-size: 14px; white-space: pre-wrap; word-break: break-word; }
  .msg.user { background: #1f6feb; color: #fff; align-self: flex-end; border-bottom-right-radius: 4px; }
  .msg.assistant { background: #21262d; color: #e6edf3; align-self: flex-start; border-bottom-left-radius: 4px; }
  .msg.tool { background: #0d4429; color: #7ee787; align-self: flex-start; font-family: 'SF Mono', 'Fira Code', monospace; font-size: 12px; border-bottom-left-radius: 4px; }
  .msg.error { background: #571a1a; color: #ffa198; align-self: flex-start; border-bottom-left-radius: 4px; }
  .msg .typing::after { content: '\\u258B'; animation: blink 1s step-end infinite; }
  @keyframes blink { 50% { opacity: 0; } }
  #input-area { padding: 16px 24px; border-top: 1px solid #30363d; background: #161b22; display: flex; gap: 12px; }
  #input { flex: 1; background: #0d1117; border: 1px solid #30363d; border-radius: 8px; padding: 12px 16px; color: #e6edf3; font-size: 14px; outline: none; resize: none; font-family: inherit; }
  #input:focus { border-color: #58a6ff; }
  #sendBtn { background: #238636; color: #fff; border: none; border-radius: 8px; padding: 12px 24px; font-size: 14px; font-weight: 500; cursor: pointer; transition: background 0.2s; }
  #sendBtn:hover { background: #2ea043; }
  #sendBtn:disabled { opacity: 0.5; cursor: not-allowed; }
  #sendBtn.loading { background: #1e6b32; position: relative; }
  #sendBtn.loading::after { content: ''; width: 16px; height: 16px; border: 2px solid transparent; border-top-color: #fff; border-radius: 50%; animation: spin 0.6s linear infinite; display: inline-block; }
  @keyframes spin { to { transform: rotate(360deg); } }
  code { background: #161b22; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
  pre { background: #161b22; padding: 12px; border-radius: 8px; overflow-x: auto; margin: 8px 0; }
  .msg.assistant p { margin: 8px 0; }
  .msg.assistant ul, .msg.assistant ol { padding-left: 20px; }
  ::-webkit-scrollbar { width: 8px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #30363d; border-radius: 4px; }
</style>
</head>
<body>
<header>
  <h1>&#x25B6; OpenCode Advanced</h1>
  <span>v0.1.0</span>
  <div id="status">desconectado</div>
</header>
<div id="chat"></div>
<div id="input-area">
  <textarea id="input" rows="2" placeholder="Escribe tu mensaje..." enterkeyhint="send"></textarea>
  <button id="sendBtn">Enviar</button>
</div>
<script>
const chat = document.getElementById('chat');
const input = document.getElementById('input');
const sendBtn = document.getElementById('sendBtn');
const statusEl = document.getElementById('status');
let currentAssistantMsg = null;

function addMessage(role, content) {
  if (role === 'assistant' && currentAssistantMsg) {
    currentAssistantMsg.textContent += content;
    chat.scrollTop = chat.scrollHeight;
    return currentAssistantMsg;
  }
  const div = document.createElement('div');
  div.className = 'msg ' + role;
  div.textContent = content;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  if (role === 'assistant') currentAssistantMsg = div;
  return div;
}

function finalizeAssistant() {
  currentAssistantMsg = null;
}

function setLoading(loading) {
  sendBtn.disabled = loading;
  sendBtn.classList.toggle('loading', loading);
  input.disabled = loading;
  statusEl.textContent = loading ? 'procesando...' : 'conectado';
  statusEl.className = loading ? '' : 'online';
}

async function sendMessage(text) {
  if (!text.trim()) return;
  addMessage('user', text);
  input.value = '';
  setLoading(true);

  const div = document.createElement('div');
  div.className = 'msg assistant';
  div.innerHTML = '<span class="typing"></span>';
  chat.appendChild(div);
  currentAssistantMsg = div;
  chat.scrollTop = chat.scrollHeight;

  try {
    const resp = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text })
    });

    if (!resp.ok) throw new Error('HTTP ' + resp.status);

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    div.innerHTML = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split('\\n');
      buf = parts.pop() || '';
      for (const part of parts) {
        if (part.startsWith('data: ')) {
          const data = part.slice(6);
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'text') {
              div.textContent += parsed.content;
              chat.scrollTop = chat.scrollHeight;
            } else if (parsed.type === 'tool') {
              div.textContent += '\\n[Herramienta: ' + parsed.name + ']\\n';
              chat.scrollTop = chat.scrollHeight;
            } else if (parsed.type === 'error') {
              div.textContent += '\\n[Error: ' + parsed.content + ']\\n';
              chat.scrollTop = chat.scrollHeight;
            }
          } catch {}
        }
      }
    }
  } catch (err) {
    div.textContent = '[Error de conexión: ' + err.message + ']';
    div.className = 'msg error';
  }

  finalizeAssistant();
  setLoading(false);
  input.focus();
}

sendBtn.addEventListener('click', () => sendMessage(input.value));
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage(input.value);
  }
});

statusEl.textContent = 'conectado';
statusEl.className = 'online';
input.focus();
</script>
</body>
</html>`;

export async function startUI(port = 3000, model?: string): Promise<void> {
  const config = getConfig();
  const skillManager = new SkillManager();
  skillManager.load(config.skills?.paths || []);

  const agentConfig = defaultAgentConfig(model || config.model);
  let currentAgent = new AgentRunner(agentConfig, skillManager);

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const path = url.pathname;

    if (path === "/" || path === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(HTML_PAGE);
      return;
    }

    if (path === "/api/chat" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        try {
          const { message, reset } = JSON.parse(body);

          if (reset) {
            currentAgent = new AgentRunner(agentConfig, skillManager);
          }

          if (!message) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: "message required" }));
            return;
          }

          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
          });

          for await (const chunk of currentAgent.chat(message)) {
            const payload = JSON.stringify({ type: "text", content: chunk });
            res.write(`data: ${payload}\n\n`);
          }

          res.write("data: [DONE]\n\n");
          res.end();
        } catch (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });

  return new Promise((resolve, reject) => {
    server.listen(port, () => {
      console.log(`\n  OpenCode Advanced UI corriendo en:\n`);
      console.log(`  http://localhost:${port}\n`);
      console.log(`  Presiona Ctrl+C para detener\n`);
    });
    server.on("error", reject);
  });
}
