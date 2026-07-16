/**
 * Cloudflare Pages Function — AI proxy
 * Primary: Google Gemini Flash / Flash-Lite (free tier)
 * Fallback: Cloudflare Workers AI
 */

/** Minimal Pages Function type (avoids DOM vs @cloudflare/workers-types Response clash). */
type PagesFunction<Env = unknown> = (context: {
  request: Request
  env: Env
  params: Record<string, string>
  waitUntil: (promise: Promise<unknown>) => void
  next: (input?: Request | string, init?: RequestInit) => Promise<Response>
  data: Record<string, unknown>
}) => Response | Promise<Response>

export interface Env {
  GEMINI_API_KEY?: string
  AI?: Ai
}

interface Ai {
  run(model: string, input: Record<string, unknown>): Promise<unknown>
}

type AiTask =
  | "brief"
  | "pack"
  | "recheck"
  | "smartpack"
  | "ocr"
  | "tip"
  | "visa"
  | "discovery"
  | "caption"
  | "enhance"
  | "story"

interface AiMessage {
  role: string
  content:
    | string
    | Array<{
        type: string
        text?: string
        source?: { type: string; media_type: string; data: string }
      }>
}

interface AiRequestBody {
  task: AiTask
  system?: string
  messages: AiMessage[]
  maxTokens?: number
}

const VISION_TASKS = new Set<AiTask>(["ocr", "caption"])
const MAX_TOKENS: Record<string, number> = {
  brief: 1400,
  pack: 1200,
  recheck: 1200,
  smartpack: 1200,
  ocr: 600,
  tip: 1000,
  visa: 1000,
  discovery: 1200,
  caption: 500,
  enhance: 600,
  story: 800,
}

const rateLimit = new Map<string, { count: number; reset: number }>()
const RATE_LIMIT = 20
const RATE_WINDOW_MS = 60 * 60 * 1000

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimit.get(ip)
  if (!entry || now > entry.reset) {
    rateLimit.set(ip, { count: 1, reset: now + RATE_WINDOW_MS })
    return true
  }
  if (entry.count >= RATE_LIMIT) return false
  entry.count++
  return true
}

function messagesToGemini(messages: AiMessage[], system?: string) {
  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = []
  if (system) parts.push({ text: system + "\n\n" })
  for (const msg of messages) {
    if (typeof msg.content === "string") {
      parts.push({ text: msg.content })
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === "text" && part.text) parts.push({ text: part.text })
        if (part.type === "image" && part.source?.data) {
          parts.push({
            inlineData: {
              mimeType: part.source.media_type || "image/jpeg",
              data: part.source.data,
            },
          })
        }
      }
    }
  }
  return parts
}

async function callGemini(
  apiKey: string,
  model: string,
  messages: AiMessage[],
  system: string | undefined,
  maxTokens: number,
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
  const parts = messagesToGemini(messages, system)
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gemini error ${res.status}: ${err.slice(0, 200)}`)
  }
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? ""
}

async function callWorkersAI(
  ai: Ai,
  task: AiTask,
  messages: AiMessage[],
  system: string | undefined,
  maxTokens: number,
): Promise<string> {
  const isVision = VISION_TASKS.has(task)
  const model = isVision
    ? "@cf/meta/llama-3.2-11b-vision-instruct"
    : "@cf/meta/llama-3.2-3b-instruct"

  let prompt = system ? `${system}\n\n` : ""
  for (const msg of messages) {
    if (typeof msg.content === "string") prompt += msg.content
    else if (Array.isArray(msg.content)) {
      for (const p of msg.content) {
        if (p.type === "text" && p.text) prompt += p.text
      }
    }
  }

  const input: Record<string, unknown> = {
    messages: [{ role: "user", content: prompt }],
    max_tokens: maxTokens,
  }

  if (isVision) {
    const imgPart = messages
      .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
      .find((p) => p.type === "image" && p.source?.data)
    if (imgPart?.source?.data) {
      input.image = imgPart.source.data
    }
  }

  const result = (await ai.run(model, input)) as { response?: string }
  return result.response ?? ""
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const ip = context.request.headers.get("cf-connecting-ip") || "unknown"
  if (!checkRateLimit(ip)) {
    return Response.json({ error: "Rate limit exceeded. Try again later." }, { status: 429 })
  }

  let body: AiRequestBody
  try {
    body = await context.request.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { task, messages = [], system } = body
  if (!task || !Array.isArray(messages)) {
    return Response.json({ error: "task and messages are required" }, { status: 400 })
  }

  const maxTokens = Math.min(body.maxTokens ?? MAX_TOKENS[task] ?? 1000, MAX_TOKENS[task] ?? 1000)
  const geminiModel = VISION_TASKS.has(task) ? "gemini-2.5-flash" : "gemini-2.5-flash-lite"
  const apiKey = context.env.GEMINI_API_KEY

  try {
    let text = ""
    if (apiKey) {
      try {
        text = await callGemini(apiKey, geminiModel, messages, system, maxTokens)
      } catch (geminiErr) {
        console.warn("Gemini failed, falling back to Workers AI:", geminiErr)
        if (context.env.AI) {
          text = await callWorkersAI(context.env.AI, task, messages, system, maxTokens)
        } else {
          throw geminiErr
        }
      }
    } else if (context.env.AI) {
      text = await callWorkersAI(context.env.AI, task, messages, system, maxTokens)
    } else {
      return Response.json(
        { error: "AI not configured. Set GEMINI_API_KEY or enable Workers AI." },
        { status: 503 },
      )
    }

    if (!text) {
      return Response.json({ error: "Empty AI response" }, { status: 502 })
    }

    return Response.json({ text })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI request failed"
    return Response.json({ error: msg }, { status: 502 })
  }
}
