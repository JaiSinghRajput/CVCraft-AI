import { requestStructuredJson } from "../lib/openai";
import { sanitizeUserInput } from "../lib/prompt-guard";

export interface JobMatchResult {
	matchPercentage: number;
	headline: string;
	matchedStrengths: string[];
	missingSkills: string[];
	fitSummary: string;
	suggestions: string[];
}

const listOrFallback = (value: unknown, fallback: string[]): string[] => {
	if (!Array.isArray(value)) return fallback;
	const items = value.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean);
	return items.length > 0 ? items : fallback;
};

const roleKeywordMap: Record<string, string[]> = {
	"software engineer": ["api", "testing", "algorithms", "performance", "system design"],
	"frontend engineer": ["react", "typescript", "css", "accessibility", "frontend"],
	"backend engineer": ["node", "postgres", "redis", "scalability", "microservices"],
	"data analyst": ["sql", "python", "tableau", "dashboard", "etl"],
	"data scientist": ["machine learning", "python", "statistics", "models", "experiments"],
};

const tokenize = (text: string): Set<string> =>
	new Set(
		text
			.toLowerCase()
			.split(/[^a-z0-9+.#]+/)
			.map((token) => token.trim())
			.filter((token) => token.length > 2),
	);

const roleKeywords = (roleContext: string): string[] => {
	const normalized = roleContext.toLowerCase();
	for (const [key, keywords] of Object.entries(roleKeywordMap)) {
		if (normalized.includes(key)) return keywords;
	}
	return normalized
		.split(/[^a-z0-9+.#]+/)
		.map((token) => token.trim())
		.filter((token) => token.length > 2)
		.slice(0, 10);
};

const computeHeuristicMatch = (resumeText: string, jobDescription: string): number => {
	const resumeTokens = tokenize(resumeText);
	const jdTokens = tokenize(jobDescription);
	const importantJdTokens = [...jdTokens].filter((token) => token.length >= 4).slice(0, 140);
	const overlapCount = importantJdTokens.reduce((acc, token) => (resumeTokens.has(token) ? acc + 1 : acc), 0);
	const overlapRatio = importantJdTokens.length > 0 ? overlapCount / importantJdTokens.length : 0.25;

	const roleSignals = roleKeywords(jobDescription);
	const roleMatchCount = roleSignals.reduce(
		(acc, keyword) => (resumeText.toLowerCase().includes(keyword.toLowerCase()) ? acc + 1 : acc),
		0,
	);
	const roleRatio = roleSignals.length > 0 ? roleMatchCount / roleSignals.length : 0.25;

	const metricsCount = (resumeText.match(/\b\d+(?:\.\d+)?%|\$\d+[\d,]*|\b\d+[+]?(?=\s*(?:users|clients|projects|years|months|hours|x)\b)/gi) ?? []).length;
	const metricsBoost = Math.min(8, metricsCount * 1.2);

	const score = 42 + Math.round(overlapRatio * 40) + Math.round(roleRatio * 15) + metricsBoost;
	return Math.max(30, Math.min(96, Math.round(score)));
};

export const matchResumeToJob = async (
	resumeText: string,
	jobDescription: string,
): Promise<JobMatchResult> => {
	const safeResume = sanitizeUserInput(resumeText);
	const safeJobDescription = sanitizeUserInput(jobDescription);
	const heuristicScore = computeHeuristicMatch(safeResume, safeJobDescription);

	const fallback: JobMatchResult = {
		matchPercentage: heuristicScore,
		headline: "You have a workable baseline fit, but specific keyword and impact alignment is needed.",
		matchedStrengths: [
			"Relevant technical foundation is present.",
			"Experience appears directionally aligned with target role.",
		],
		missingSkills: ["Cloud deployment", "CI/CD", "Leadership examples"],
		fitSummary: "Candidate aligns with core requirements but should strengthen delivery and ownership signals.",
		suggestions: [
			"Add bullets proving project impact",
			"Highlight tools listed in the job description",
			"Include teamwork and ownership outcomes",
		],
	};

	const prompt = `You are an expert technical recruiter.
Compare the resume and the job description and return ONLY valid JSON with these keys:
- matchPercentage: number (0-100)
- headline: string (one personalized sentence)
- matchedStrengths: string[] (3-6)
- missingSkills: string[] (4-10)
- fitSummary: string (2-4 sentences)
- suggestions: string[] (5-10 concrete actions)

Requirements:
1) Be specific to this candidate and this job description.
2) Prioritize high-impact changes that improve interview odds.
3) No markdown, no code fences, JSON only.

Resume:
${safeResume}

Job Description:
${safeJobDescription}`;
	const result = await requestStructuredJson<JobMatchResult>(prompt, fallback);
	const resultRecord = result as unknown as Record<string, unknown>;
	const rawPercentage = Number(resultRecord.matchPercentage);
	const llmScore = Number.isFinite(rawPercentage)
		? Math.max(0, Math.min(100, Math.round(rawPercentage)))
		: fallback.matchPercentage;
	const blendedScore = Math.round(llmScore * 0.5 + heuristicScore * 0.5);
	const stabilizedScore = llmScore < heuristicScore - 20 ? heuristicScore - 5 : blendedScore;

	return {
		matchPercentage: Math.max(30, Math.min(98, stabilizedScore)),
		headline: typeof resultRecord.headline === "string" ? resultRecord.headline : fallback.headline,
		matchedStrengths: listOrFallback(resultRecord.matchedStrengths, fallback.matchedStrengths),
		missingSkills: listOrFallback(resultRecord.missingSkills, fallback.missingSkills),
		fitSummary: typeof resultRecord.fitSummary === "string" ? resultRecord.fitSummary : fallback.fitSummary,
		suggestions: listOrFallback(resultRecord.suggestions, fallback.suggestions),
	};
};
