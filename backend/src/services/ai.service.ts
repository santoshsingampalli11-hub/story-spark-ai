// backend/src/services/ai.service.ts

import { validateAndFormatPrompt, validateOutput } from "../utils/promptSecurity";
import { buildStoryPrompt, PromptOptions } from "../utils/promptBuilder";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Anthropic from "@anthropic-ai/sdk";

let openai: OpenAI | null = null;
let genAI: GoogleGenerativeAI | null = null;
let anthropic: Anthropic | null = null;

export function getGeminiClient(): GoogleGenerativeAI {
  if (!genAI) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("Gemini API key is required but was not provided. Please set GEMINI_API_KEY environment variable.");
    }
    genAI = new GoogleGenerativeAI(key);
  }
  return genAI;
}

export function getOpenAIClient(): OpenAI {
  if (!openai) {
    const key = process.env.OPEN_AI_KEY || process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error("OpenAI API key is required but was not provided. Please set OPEN_AI_KEY environment variable.");
    }
    openai = new OpenAI({ apiKey: key });
  }
  return openai;
}

export function getAnthropicClient(): Anthropic {
  if (!anthropic) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error("Anthropic API key is required but was not provided. Please set ANTHROPIC_API_KEY environment variable.");
    }
    anthropic = new Anthropic({ apiKey: key });
  }
  return anthropic;
}

export const GEMINI_MODEL = "gemini-2.5-flash";
export const CLAUDE_MODEL = "claude-3-5-sonnet-20241022";
export const OPENAI_MODEL = "gpt-4o-mini"; 

// ─── Circuit Breaker ─────────────────────────────────────────────────────────

interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number;
}

const CIRCUIT_BREAKER_CONFIG = {
  maxFailures: 3,
  cooldownMs: 60 * 1000, // 1 minute
};

const circuitBreakers: Record<string, CircuitBreakerState> = {
  openai: { failures: 0, lastFailureTime: 0 },
  anthropic: { failures: 0, lastFailureTime: 0 },
  gemini: { failures: 0, lastFailureTime: 0 },
};

class CircuitBreakerError extends Error {
  constructor(provider: string, remainingSeconds: number) {
    super(`Circuit breaker open for ${provider}. Please try again in ${remainingSeconds}s.`);
    this.name = "CircuitBreakerError";
  }
}

function checkCircuitBreaker(provider: "openai" | "anthropic" | "gemini"): void {
  const state = circuitBreakers[provider];
  if (state.failures >= CIRCUIT_BREAKER_CONFIG.maxFailures) {
    const timeSinceLastFailure = Date.now() - state.lastFailureTime;
    if (timeSinceLastFailure < CIRCUIT_BREAKER_CONFIG.cooldownMs) {
      const remainingSeconds = Math.ceil((CIRCUIT_BREAKER_CONFIG.cooldownMs - timeSinceLastFailure) / 1000);
      throw new CircuitBreakerError(provider, remainingSeconds);
    }
  }
}

function recordSuccess(provider: "openai" | "anthropic" | "gemini"): void {
  circuitBreakers[provider].failures = 0;
  circuitBreakers[provider].lastFailureTime = 0;
}

function recordFailure(provider: "openai" | "anthropic" | "gemini"): void {
  circuitBreakers[provider].failures++;
  circuitBreakers[provider].lastFailureTime = Date.now();
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface AIResponse {
  story: string; // This will now contain the stringified JSON payload
  provider: "openai" | "gemini" | "anthropic";
  fallbackUsed: boolean;
}

// ─── OpenAI call ─────────────────────────────────────────────────────────────

async function generateWithOpenAI(systemPrompt: string, userPrompt: string): Promise<string> {
  const client = getOpenAIClient();
  const response = await client.chat.completions.create(
    {
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" }, // Enforce structured JSON output
      max_tokens: 1500,
    },
    { timeout: 60000 }
  );

  const text = response.choices[0]?.message?.content;
  if (!text) throw new Error("OpenAI returned an empty response");
  return text;
}

// ─── Anthropic call ──────────────────────────────────────────────────────────

async function generateWithAnthropic(systemPrompt: string, userPrompt: string): Promise<string> {
  const client = getAnthropicClient();
  const response = await client.messages.create(
    {
      model: CLAUDE_MODEL,
      system: systemPrompt, // Anthropic handles system instructions top-level
      max_tokens: 1500,
      messages: [{ role: "user", content: userPrompt }],
    },
    { timeout: 60000 }
  );

  const textBlock = response.content.find((block) => block.type === "text");
  const text = textBlock?.type === "text" ? textBlock.text : "";
  if (!text) throw new Error("Anthropic returned an empty response");
  return text;
}

// ─── Gemini call ─────────────────────────────────────────────────────────────

async function generateWithGemini(systemPrompt: string, userPrompt: string): Promise<string> {
  const client = getGeminiClient();
  
  // Use systemInstruction for gemini-2.5 models
  const model = client.getGenerativeModel({ 
    model: GEMINI_MODEL,
    systemInstruction: systemPrompt 
  });
  
  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    generationConfig: {
      responseMimeType: "application/json", // Enforce structured JSON output
    }
  });
  
  const text = result.response.text();
  if (!text) throw new Error("Gemini returned an empty response");
  return text;
}

// ─── Helper ────────────────────────────

function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return true;

  const msg = error.message.toLowerCase();

  // Rate limits, timeouts, server errors → fallback
  if (msg.includes("rate limit"))      return true;
  if (msg.includes("timeout"))         return true;
  if (msg.includes("503") ||
      msg.includes("502") ||
      msg.includes("500"))             return true;
  if (msg.includes("empty response"))  return true;

  // Bad API key -> don't bother with fallback since it won't help
  if (msg.includes("401") ||
      msg.includes("invalid api key")) return false;

  return true; // fallback by default
}

// ─── Main exported function ───────────────────────────────────────────────────

export async function generateStory(
  prompt: string, 
  provider?: string, 
  options?: PromptOptions
): Promise<AIResponse> {
  // ── Security layer: validate and wrap input ─────────────────────────
  const securePrompt = validateAndFormatPrompt(prompt);

  // ── Prompt builder: morph into structured AI instructions ───────
  const { systemPrompt, userPrompt } = buildStoryPrompt(securePrompt, options);

  const chosenProvider = provider?.toLowerCase();
  let didFallbackToGemini = false;

  if (chosenProvider === "anthropic" || chosenProvider === "claude") {
    // ── Try Anthropic first ──────────────────────────────────────────────────
    try {
      checkCircuitBreaker("anthropic");
      let story = await generateWithAnthropic(systemPrompt, userPrompt);
      story = validateOutput(story); // Security layer: validate output
      recordSuccess("anthropic");
      console.log("[AI] Story generated successfully via Anthropic");
      return { story, provider: "anthropic", fallbackUsed: false };
    } catch (anthropicError) {
      console.warn(
        "[AI] Anthropic failed:",
        anthropicError instanceof Error ? anthropicError.message : anthropicError
      );

      const isCircuitOpen = anthropicError instanceof CircuitBreakerError;
      if (!isCircuitOpen) {
        recordFailure("anthropic");
      }

      if (!isCircuitOpen && !isRetryableError(anthropicError)) {
        throw new Error(
          "Anthropic request failed with a non-retryable error. Please check your API key."
        );
      }
      didFallbackToGemini = true;
      console.log("[AI] Falling back to Gemini...");
    }
  } else if (chosenProvider === "openai" || !chosenProvider) {
    // ── Try OpenAI first ──────────────────────────────────────────────────────
    try {
      checkCircuitBreaker("openai");
      let story = await generateWithOpenAI(systemPrompt, userPrompt);
      story = validateOutput(story); // Security layer: validate output
      recordSuccess("openai");
      console.log("[AI] Story generated successfully via OpenAI");

      return { story, provider: "openai", fallbackUsed: false };

    } catch (openAIError) {
      console.warn(
        "[AI] OpenAI failed:",
        openAIError instanceof Error ? openAIError.message : openAIError
      );

      const isCircuitOpen = openAIError instanceof CircuitBreakerError;
      if (!isCircuitOpen) {
        recordFailure("openai");
      }

      // Only fall back if the error type warrants it
      if (!isCircuitOpen && !isRetryableError(openAIError)) {
        throw new Error(
          "OpenAI request failed with a non-retryable error. Please check your API key."
        );
      }

      didFallbackToGemini = true;
      console.log("[AI] Falling back to Gemini.");
    }
  } else if (chosenProvider === "gemini") {
    // Skip OpenAI/Anthropic blocks
  } else {
    // Unknown provider
    throw new Error(`Unsupported AI provider: ${provider}`);
  }

  // ── Try Gemini as fallback / direct ───────────────────────────────────────
  try {
    checkCircuitBreaker("gemini");
    let story = await generateWithGemini(systemPrompt, userPrompt);
    story = validateOutput(story); // Security layer: validate output
    recordSuccess("gemini");
    console.log(`[AI] Story generated successfully via Gemini (${didFallbackToGemini ? "fallback" : "direct"})`);

    return { story, provider: "gemini", fallbackUsed: didFallbackToGemini };

  } catch (geminiError) {
    console.error(
      "[AI] Gemini also failed.",
      geminiError instanceof Error ? geminiError.message : geminiError
    );

    const isCircuitOpen = geminiError instanceof CircuitBreakerError;
    if (!isCircuitOpen) {
      recordFailure("gemini");
    }

    if (isCircuitOpen) {
      throw new Error(`Story generation failed. ${geminiError instanceof Error ? geminiError.message : ""}`);
    }

    // All failed — throw a clean user-facing error
    throw new Error(
      "Story generation failed. All AI providers are currently unavailable. Please try again later."
    );
  }
}
