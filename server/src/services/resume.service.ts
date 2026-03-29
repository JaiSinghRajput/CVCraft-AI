import { requestStructuredJson } from "../lib/openai";
import { sanitizeUserInput } from "../lib/prompt-guard";

type RiskLevel = "low" | "medium" | "high";

export interface SectionRating {
section: string;
score: number;
summary: string;
riskLevel: RiskLevel;
}

export interface ProfileFit {
profile: string;
fitPercentage: number;
reason: string;
}

export interface GrammarImprovement {
issue: string;
suggestion: string;
riskLevel: RiskLevel;
example: string;
}

export interface AtsImprovement {
issue: string;
impact: string;
riskLevel: RiskLevel;
fix: string;
}

export interface CoreImprovement {
area: string;
riskLevel: RiskLevel;
actions: string[];
expectedOutcome: string;
}

export interface ResumeAnalysisResult {
atsScore: number;
headline: string;
sectionRatings: SectionRating[];
strictFittingProfiles: ProfileFit[];
goodPoints: string[];
grammarImprovements: GrammarImprovement[];
atsImprovements: AtsImprovement[];
overallRiskLevel: RiskLevel;
coreImprovements: CoreImprovement[];
suggestions: string[];
next7Days: string[];
fitSummary: string;
}

const skillLexicon = [
"react",
"typescript",
"javascript",
"node",
"python",
"sql",
"docker",
"aws",
"azure",
"gcp",
"kubernetes",
"git",
"ci/cd",
"graphql",
"rest",
"redis",
"postgres",
] as const;

const actionVerbs = [
"built",
"delivered",
"improved",
"designed",
"implemented",
"optimized",
"launched",
"led",
"reduced",
"increased",
"automated",
];

const profileSignals: Array<{ profile: string; keywords: string[] }> = [
{ profile: "Backend Engineer", keywords: ["node", "api", "redis", "postgres", "scalability"] },
{ profile: "Frontend Engineer", keywords: ["react", "typescript", "frontend", "ui", "css"] },
{ profile: "Full Stack Engineer", keywords: ["react", "node", "api", "sql", "docker"] },
{ profile: "Data Analyst", keywords: ["sql", "python", "dashboard", "excel", "tableau"] },
{ profile: "Data Scientist", keywords: ["python", "model", "statistics", "machine learning"] },
{ profile: "DevOps Engineer", keywords: ["docker", "kubernetes", "ci/cd", "aws", "monitoring"] },
];

const countMatches = (text: string, keywords: string[]): number =>
keywords.reduce((acc, keyword) => (text.includes(keyword) ? acc + 1 : acc), 0);

const detectSkills = (text: string): string[] => {
const normalized = text.toLowerCase();
return skillLexicon.filter((item) => normalized.includes(item));
};

const clampScore = (value: unknown, fallback: number): number => {
const numeric = Number(value);
if (!Number.isFinite(numeric)) return fallback;
return Math.max(0, Math.min(100, Math.round(numeric)));
};

const computeHeuristicAtsScore = (safeText: string): number => {
const lower = safeText.toLowerCase();
const words = safeText.split(/\s+/).filter(Boolean).length;
const bullets = (safeText.match(/(^|\n)\s*[-*�]/g) ?? []).length;
const metrics =
(safeText.match(/\b\d+(?:\.\d+)?%|\$\d+[\d,]*|\b\d+[+]?(?=\s*(?:users|clients|projects|years|months|hours|x)\b)/gi) ?? [])
.length;
const sectionKeywords = ["summary", "experience", "skills", "education", "projects", "certifications"];
const sectionHits = countMatches(lower, sectionKeywords);
const verbHits = countMatches(lower, actionVerbs);
const skillHits = countMatches(lower, [...skillLexicon]);

const lengthBonus = words >= 280 && words <= 1100 ? 9 : words >= 180 && words <= 1400 ? 4 : -8;

const rawScore =
58 +
Math.min(24, sectionHits * 4) +
Math.min(12, metrics * 2.2) +
Math.min(8, bullets * 0.5) +
Math.min(9, verbHits * 0.9) +
Math.min(12, skillHits * 1.7) +
lengthBonus;

return Math.max(45, Math.min(96, Math.round(rawScore)));
};

const inferProfiles = (safeText: string): ProfileFit[] => {
const lower = safeText.toLowerCase();
return profileSignals
.map((item) => {
const hits = countMatches(lower, item.keywords);
const ratio = item.keywords.length > 0 ? hits / item.keywords.length : 0;
return {
profile: item.profile,
fitPercentage: Math.max(15, Math.min(95, Math.round(28 + ratio * 67))),
reason:
hits > 0
? `Aligned signals found: ${item.keywords.filter((k) => lower.includes(k)).slice(0, 3).join(", ")}.`
: "Limited direct keyword evidence in resume text.",
};
})
.sort((a, b) => b.fitPercentage - a.fitPercentage)
.slice(0, 4);
};

const buildSectionRatings = (safeText: string): SectionRating[] => {
const lower = safeText.toLowerCase();
const hasMetrics = (safeText.match(/\b\d+(?:\.\d+)?%|\$\d+[\d,]*/gi) ?? []).length;
const skillHits = detectSkills(safeText).length;
const projectHits = countMatches(lower, ["project", "built", "launched", "implemented"]);
const grammarNoise = (safeText.match(/\s{2,}|\b(i|im|ive)\b/g) ?? []).length;

const clamp = (v: number): number => Math.max(25, Math.min(98, Math.round(v)));
const scoreToRisk = (score: number): RiskLevel => (score >= 80 ? "low" : score >= 60 ? "medium" : "high");

const sections: Array<{ section: string; score: number; summary: string }> = [
{
section: "Experience Impact",
score: clamp(48 + hasMetrics * 6),
summary: "Measures how strongly achievements show business outcomes and ownership.",
},
{
section: "Skills Coverage",
score: clamp(44 + skillHits * 6),
summary: "Measures breadth and relevance of technical capabilities for ATS screening.",
},
{
section: "Projects Quality",
score: clamp(42 + projectHits * 7),
summary: "Measures project clarity, delivery signals, and practical problem-solving evidence.",
},
{
section: "Formatting & Clarity",
score: clamp(78 - grammarNoise * 4),
summary: "Measures readability, consistency, and recruiter scan speed.",
},
{
section: "ATS Structure",
score: clamp(52 + countMatches(lower, ["summary", "experience", "skills", "education", "projects"]) * 6),
summary: "Measures section standardization and machine readability of resume layout.",
},
];

return sections.map((item) => ({ ...item, riskLevel: scoreToRisk(item.score) }));
};

const buildFallback = (safeText: string): ResumeAnalysisResult => {
const skills = detectSkills(safeText);
const sectionRatings = buildSectionRatings(safeText);
const strictFittingProfiles = inferProfiles(safeText);
const overallRiskLevel: RiskLevel = sectionRatings.some((s) => s.riskLevel === "high")
? "high"
: sectionRatings.some((s) => s.riskLevel === "medium")
? "medium"
: "low";

const skillSummary = skills.length > 0 ? skills.slice(0, 5).join(", ") : "core engineering skills";
const atsScore = computeHeuristicAtsScore(safeText);

return {
atsScore,
headline: "Strong baseline resume with clear potential; targeted refinements can significantly improve shortlist confidence.",
sectionRatings,
strictFittingProfiles,
goodPoints: [
`Technical footprint includes ${skillSummary}.`,
"Resume contains usable structure for recruiters and ATS parsing.",
"Experience depth is sufficient to produce strong impact bullets.",
"Content already has several role-aligned signals.",
],
grammarImprovements: [
{
issue: "Inconsistent tense and sentence style across bullets.",
suggestion: "Use past tense for completed work and present tense only for ongoing roles.",
riskLevel: "medium",
example: "Built a CI pipeline that reduced release rollback incidents by 30%.",
},
{
issue: "Long sentence bullets reduce scan speed.",
suggestion: "Keep each bullet under 24 words and start with a strong action verb.",
riskLevel: "low",
example: "Automated weekly reporting, saving 6 team-hours per sprint.",
},
],
atsImprovements: [
{
issue: "Impact metrics are missing in multiple key bullets.",
impact: "Can lower recruiter confidence and ATS ranking weight.",
riskLevel: "high",
fix: "Add quantifiable outcomes to top 6 experience bullets.",
},
{
issue: "Skills taxonomy is not grouped for quick ATS parsing.",
impact: "Keyword matching can be less consistent.",
riskLevel: "medium",
fix: "Group skills into Languages, Frameworks, Cloud, Databases, and Tooling.",
},
],
overallRiskLevel,
coreImprovements: [
{
area: "Achievement depth",
riskLevel: "high",
actions: ["Rewrite bullets with action + scope + metric.", "Prioritize business impact over responsibilities."],
expectedOutcome: "Higher credibility in first recruiter pass.",
},
{
area: "ATS keyword architecture",
riskLevel: "medium",
actions: ["Align headings with standard ATS sections.", "Mirror role-relevant terms naturally in achievements."],
expectedOutcome: "Stronger keyword match and improved ranking consistency.",
},
],
suggestions: [
"Rewrite the top 6 experience bullets using action + scope + measurable outcome.",
"Create a focused skills section grouped by category for ATS readability.",
"Add 1-2 project bullets that demonstrate end-to-end ownership and measurable impact.",
"Use concise grammar and consistent tense across all sections.",
"Improve summary line with role signal + years + strongest measurable outcome.",
"Keep each bullet concise and avoid generic responsibility statements.",
],
next7Days: [
"Day 1-2: Improve grammar/tense consistency and rewrite top experience bullets.",
"Day 3-4: Strengthen ATS sections and add metric-rich project evidence.",
"Day 5-7: Create two role-focused versions and test shortlist quality.",
],
fitSummary:
"This resume has strong fundamentals. By improving metric density, grammatical consistency, and ATS structure, it can move from good to highly shortlist-ready.",
};
};

const listOrFallback = (value: unknown, fallback: string[]): string[] => {
if (!Array.isArray(value)) return fallback;
const items = value.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean);
return items.length > 0 ? items : fallback;
};

const normalizeSectionRatings = (value: unknown, fallback: SectionRating[]): SectionRating[] => {
if (!Array.isArray(value)) return fallback;
const rows = value
.map((item): SectionRating | null => {
if (!item || typeof item !== "object") return null;
const typed = item as Partial<SectionRating>;
const section = typeof typed.section === "string" ? typed.section.trim() : "";
const summary = typeof typed.summary === "string" ? typed.summary.trim() : "";
const score = clampScore(typed.score, 60);
const riskLevel: RiskLevel =
typed.riskLevel === "low" || typed.riskLevel === "medium" || typed.riskLevel === "high"
? typed.riskLevel
: score >= 80
? "low"
: score >= 60
? "medium"
: "high";
if (!section || !summary) return null;
return { section, summary, score, riskLevel };
})
.filter((item): item is SectionRating => item !== null);

return rows.length > 0 ? rows : fallback;
};

const normalizeProfileFits = (value: unknown, fallback: ProfileFit[]): ProfileFit[] => {
if (!Array.isArray(value)) return fallback;
const rows = value
.map((item): ProfileFit | null => {
if (!item || typeof item !== "object") return null;
const typed = item as Partial<ProfileFit>;
const profile = typeof typed.profile === "string" ? typed.profile.trim() : "";
const reason = typeof typed.reason === "string" ? typed.reason.trim() : "";
const fitPercentage = clampScore(typed.fitPercentage, 50);
if (!profile || !reason) return null;
return { profile, reason, fitPercentage };
})
.filter((item): item is ProfileFit => item !== null)
.sort((a, b) => b.fitPercentage - a.fitPercentage)
.slice(0, 5);

return rows.length > 0 ? rows : fallback;
};

const normalizeGrammarImprovements = (value: unknown, fallback: GrammarImprovement[]): GrammarImprovement[] => {
if (!Array.isArray(value)) return fallback;
const rows = value
.map((item): GrammarImprovement | null => {
if (!item || typeof item !== "object") return null;
const typed = item as Partial<GrammarImprovement>;
const issue = typeof typed.issue === "string" ? typed.issue.trim() : "";
const suggestion = typeof typed.suggestion === "string" ? typed.suggestion.trim() : "";
const example = typeof typed.example === "string" ? typed.example.trim() : "";
const riskLevel: RiskLevel =
typed.riskLevel === "low" || typed.riskLevel === "medium" || typed.riskLevel === "high"
? typed.riskLevel
: "medium";
if (!issue || !suggestion || !example) return null;
return { issue, suggestion, example, riskLevel };
})
.filter((item): item is GrammarImprovement => item !== null);

return rows.length > 0 ? rows : fallback;
};

const normalizeAtsImprovements = (value: unknown, fallback: AtsImprovement[]): AtsImprovement[] => {
if (!Array.isArray(value)) return fallback;
const rows = value
.map((item): AtsImprovement | null => {
if (!item || typeof item !== "object") return null;
const typed = item as Partial<AtsImprovement>;
const issue = typeof typed.issue === "string" ? typed.issue.trim() : "";
const impact = typeof typed.impact === "string" ? typed.impact.trim() : "";
const fix = typeof typed.fix === "string" ? typed.fix.trim() : "";
const riskLevel: RiskLevel =
typed.riskLevel === "low" || typed.riskLevel === "medium" || typed.riskLevel === "high"
? typed.riskLevel
: "medium";
if (!issue || !impact || !fix) return null;
return { issue, impact, fix, riskLevel };
})
.filter((item): item is AtsImprovement => item !== null);

return rows.length > 0 ? rows : fallback;
};

const normalizeCoreImprovements = (value: unknown, fallback: CoreImprovement[]): CoreImprovement[] => {
if (!Array.isArray(value)) return fallback;

const normalized = value
.map((item): CoreImprovement | null => {
if (!item || typeof item !== "object") return null;
const typed = item as Partial<CoreImprovement>;
const area = typeof typed.area === "string" ? typed.area.trim() : "";
const expectedOutcome = typeof typed.expectedOutcome === "string" ? typed.expectedOutcome.trim() : "";
const actions = listOrFallback(typed.actions, []);
if (!area || !expectedOutcome || actions.length === 0) return null;
const riskLevel: RiskLevel =
typed.riskLevel === "high" || typed.riskLevel === "medium" || typed.riskLevel === "low"
? typed.riskLevel
: "medium";
return { area, riskLevel, actions, expectedOutcome };
})
.filter((item): item is CoreImprovement => item !== null);

return normalized.length > 0 ? normalized : fallback;
};

const withMinimumItems = <T>(current: T[], fallback: T[], minItems: number): T[] => {
	if (current.length >= minItems) return current;
	if (fallback.length === 0) return current;
	return [...current, ...fallback].slice(0, Math.max(minItems, current.length));
};

export const analyzeResumeText = async (resumeText: string): Promise<ResumeAnalysisResult> => {
const safeText = sanitizeUserInput(resumeText);
const fallback = buildFallback(safeText);
const heuristicScore = computeHeuristicAtsScore(safeText);

const prompt = `You are a senior resume reviewer with ATS expertise.
Analyze the resume text and return ONLY valid JSON with these exact keys:
- atsScore: number (0-100)
- headline: string (one personalized sentence)
- sectionRatings: array with 5-8 objects {section, score, summary, riskLevel}
- strictFittingProfiles: array with 3-5 objects {profile, fitPercentage, reason}
- goodPoints: string[] (4-8)
- grammarImprovements: array with 3-6 objects {issue, suggestion, riskLevel, example}
- atsImprovements: array with 4-8 objects {issue, impact, riskLevel, fix}
- overallRiskLevel: "low" | "medium" | "high"
- coreImprovements: array with 3-6 objects {area, riskLevel, actions, expectedOutcome}
- suggestions: string[] (6-12, practical and specific)
- next7Days: string[] (3-5 realistic action steps)
- fitSummary: string (2-4 sentences)

Requirements:
1) Make output user-specific based on evidence in resume text.
2) Do not output generic filler text.
3) Treat this as full resume analysis, not only weaknesses.
4) Include balanced strengths + risks + concrete fixes.
5) Do NOT return empty arrays. If uncertain, infer best plausible entries from resume evidence.
5) No markdown, no code fences, JSON only.

Resume text:
${safeText}`;

const result = await requestStructuredJson<ResumeAnalysisResult>(prompt, fallback);
const resultRecord = result as unknown as Record<string, unknown>;
const llmScore = clampScore(resultRecord.atsScore, fallback.atsScore);
const blendedScore = Math.round(llmScore * 0.5 + heuristicScore * 0.5);
const stabilizedScore = llmScore < heuristicScore - 22 ? heuristicScore - 6 : blendedScore;

	const sectionRatings = withMinimumItems(
		normalizeSectionRatings(resultRecord.sectionRatings, fallback.sectionRatings),
		fallback.sectionRatings,
		4,
	);
	const strictFittingProfiles = withMinimumItems(
		normalizeProfileFits(resultRecord.strictFittingProfiles, fallback.strictFittingProfiles),
		fallback.strictFittingProfiles,
		3,
	);
	const grammarImprovements = withMinimumItems(
		normalizeGrammarImprovements(resultRecord.grammarImprovements, fallback.grammarImprovements),
		fallback.grammarImprovements,
		2,
	);
	const atsImprovements = withMinimumItems(
		normalizeAtsImprovements(resultRecord.atsImprovements, fallback.atsImprovements),
		fallback.atsImprovements,
		2,
	);
	const coreImprovements = withMinimumItems(
		normalizeCoreImprovements(resultRecord.coreImprovements, fallback.coreImprovements),
		fallback.coreImprovements,
		2,
	);

const overallRiskLevel: RiskLevel =
resultRecord.overallRiskLevel === "low" ||
resultRecord.overallRiskLevel === "medium" ||
resultRecord.overallRiskLevel === "high"
? (resultRecord.overallRiskLevel as RiskLevel)
: sectionRatings.some((s) => s.riskLevel === "high")
? "high"
: sectionRatings.some((s) => s.riskLevel === "medium")
? "medium"
: "low";

return {
atsScore: Math.max(40, Math.min(98, stabilizedScore)),
headline: typeof resultRecord.headline === "string" ? resultRecord.headline : fallback.headline,
sectionRatings,
strictFittingProfiles,
		goodPoints: withMinimumItems(listOrFallback(resultRecord.goodPoints, fallback.goodPoints), fallback.goodPoints, 3),
grammarImprovements,
atsImprovements,
overallRiskLevel,
coreImprovements,
		suggestions: withMinimumItems(listOrFallback(resultRecord.suggestions, fallback.suggestions), fallback.suggestions, 5),
		next7Days: withMinimumItems(listOrFallback(resultRecord.next7Days, fallback.next7Days), fallback.next7Days, 3),
fitSummary: typeof resultRecord.fitSummary === "string" ? resultRecord.fitSummary : fallback.fitSummary,
};
};
