export type AiTask =
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

export interface AiMessage {
  role: "user" | "assistant"
  content:
    | string
    | Array<{
        type: string
        text?: string
        source?: { type: string; media_type: string; data: string }
      }>
}

export interface AiRequest {
  task: AiTask
  system?: string
  messages: AiMessage[]
  maxTokens?: number
}

export async function callAi(req: AiRequest): Promise<string> {
  const res = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(err.error || `AI request failed (${res.status})`)
  }
  const data = (await res.json()) as { text?: string }
  return data.text ?? ""
}
