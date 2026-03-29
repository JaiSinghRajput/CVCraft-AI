import OpenAI from "openai";

import { env } from "./env";
import { logger } from "./logger";

const hasProvider = Boolean(env.openAiApiKey) || Boolean(env.openAiBaseUrl);
const client = hasProvider
	? new OpenAI({
		apiKey: env.openAiApiKey || "not-needed",
		baseURL: env.openAiBaseUrl || undefined,
	})
	: null;

const normalizeJsonLikeText = (text: string): string =>
	text
		.replace(/[\u201C\u201D]/g, '"')
		.replace(/[\u2018\u2019]/g, "'")
		.replace(/\u00A0/g, " ")
		.trim();

const extractFromMarkdownFence = (text: string): string | null => {
	const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
	return match ? match[1] : null;
};

const extractBalancedJsonBlock = (text: string): string | null => {
	let inString = false;
	let escaped = false;
	let stack: string[] = [];
	let start = -1;

	for (let i = 0; i < text.length; i += 1) {
		const ch = text[i];

		if (inString) {
			if (escaped) {
				escaped = false;
				continue;
			}
			if (ch === "\\") {
				escaped = true;
				continue;
			}
			if (ch === '"') {
				inString = false;
			}
			continue;
		}

		if (ch === '"') {
			inString = true;
			continue;
		}

		if (ch === "{" || ch === "[") {
			if (stack.length === 0) {
				start = i;
			}
			stack.push(ch);
			continue;
		}

		if (ch === "}" || ch === "]") {
			if (stack.length === 0) {
				continue;
			}

			const opening = stack[stack.length - 1];
			const closesPair = (opening === "{" && ch === "}") || (opening === "[" && ch === "]");
			if (!closesPair) {
				continue;
			}

			stack.pop();
			if (stack.length === 0 && start >= 0) {
				return text.slice(start, i + 1);
			}
		}
	}

	return null;
};

const parseStructuredContent = <T>(raw: string): T | null => {
	const normalized = normalizeJsonLikeText(raw);
	const candidates = [
		normalized,
		extractFromMarkdownFence(normalized) ?? "",
		extractBalancedJsonBlock(normalized) ?? "",
	].filter(Boolean);

	for (const candidate of candidates) {
		try {
			return JSON.parse(candidate) as T;
		} catch {
			// Try the next candidate.
		}
	}

	return null;
};

export const requestStructuredJson = async <T>(prompt: string, fallback: T): Promise<T> => {
	if (!client) {
		return fallback;
	}

	const response = await client.chat.completions.create({
		model: env.openAiModel,
		temperature: 0.2,
		messages: [
			{
				role: "system",
				content:
					"You are a strict JSON API. Return only valid minified JSON with no markdown or extra text.",
			},
			{ role: "user", content: prompt },
		],
	});

	const raw = response.choices[0]?.message?.content ?? "";
	const parsed = parseStructuredContent<T>(raw);
	if (!parsed) {
		logger.warn("AI response was not valid JSON; using fallback response.");
		return fallback;
	}

	return parsed;
};
