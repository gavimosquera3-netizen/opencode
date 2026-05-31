# OpenCode Advanced

CLI de IA para ingeniería de software con capacidades superiores.

## Instalación

```bash
npm install -g opencode-advanced
```

O desde el código fuente:

```bash
git clone <repo>
cd opencode-advanced
npm install
npm run build
npm link
```

## Uso

```bash
# Chat interactivo
opencode-advanced chat

# Modo one-shot
opencode-advanced run "explora este proyecto y dime de qué trata"

# Ejecutar instrucciones desde un archivo
opencode-advanced exec instrucciones.md

# Inicializar configuración
opencode-advanced init
```

## Configuración

Crea un `opencode-advanced.json` en la raíz de tu proyecto:

```json
{
  "model": "gpt-4o",
  "permission": {
    "edit": "allow",
    "bash": "allow",
    "read": "allow",
    "webfetch": "allow",
    "websearch": "allow",
    "question": "allow",
    "task": "allow"
  }
}
```

### Variables de entorno

- `OPENAI_API_KEY` - API key para OpenAI
- `OPENAI_BASE_URL` - URL base para proveedores compatibles con OpenAI
- `OPENAI_MODEL` - Modelo por defecto
- `ANTHROPIC_API_KEY` - API key para Anthropic

### Modelos

El modelo se especifica en el formato `provider/model`:

- `gpt-4o` - OpenAI GPT-4o
- `claude-sonnet-4-6` - Anthropic Claude Sonnet
- `kilo-free/deepseek-v4-flash:free` - Kilo Gateway
- `ollama/llama3` - Ollama local

## Herramientas

- **bash** - Ejecuta comandos en el sistema
- **read** - Lee archivos
- **write** - Crea/escribe archivos
- **edit** - Reemplaza texto en archivos
- **glob** - Busca archivos por patrón
- **grep** - Busca contenido con regex
- **webfetch** - Obtiene contenido de URLs
- **websearch** - Busca en la web
- **question** - Pregunta al usuario
- **task** - Delega a sub-agentes
- **memory** - Memoria persistente

## Skills

Coloca skills en `.opencode-advanced/skills/<name>/SKILL.md`:

```markdown
---
name: my-skill
description: Úsalo cuando trabajes con...
---

Contenido de la skill en markdown.
```

## Plugins

Los plugins se cargan desde `opencode-advanced.json`:

```json
{
  "plugin": ["./path/to/plugin.ts"]
}
```

## Licencia

MIT
