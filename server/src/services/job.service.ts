import { requestStructuredJson } from "../lib/openai";
import { sanitizeUserInput } from "../lib/prompt-guard";

type Severity = "low" | "medium" | "high";

interface MatchCategoryScore {
category: string;
score: number;
evidence: string;
}

interface DomainAlignment {
resumeDomain: string;
jobDomain: string;
isAligned: boolean;
confidence: number;
rationale: string;
}

interface CriticalGap {
gap: string;
severity: Severity;
whyItMatters: string;
}

interface ExtractedJobRequirements {
roleTitle: string;
jobDomain: string;
coreSkills: string[];
mustHaveRequirements: string[];
responsibilities: string[];
exclusionTerms: string[];
}

export interface JobMatchResult {
matchPercentage: number;
headline: string;
fitSummary: string;
recommendation: string;
extractedRequirements: ExtractedJobRequirements;
domainAlignment: DomainAlignment;
categoryScores: MatchCategoryScore[];
matchedStrengths: string[];
missingSkills: string[];
criticalGaps: CriticalGap[];
suggestions: string[];
}

const stopwords = new Set([
"the",
"and",
"for",
"with",
"from",
"that",
"this",
"you",
"your",
"will",
"have",
"has",
"are",
"our",
"not",
"all",
"can",
"using",
"use",
"into",
"over",
"such",
"their",
"required",
"preferred",
"experience",
"years",
"year",
"month",
"months",
"about",
"job",
"location",
"type",
"full-time",
"internship",
"intern",
"stipend",
"remote",
"benefits",
"perks",
"opportunity",
"apply",
"role",
"company",
"skillzenloop",
"strong",
"basic",
"knowledge",
]);

const jdNoiseTokens = new Set([
"remote",
"full-time",
"internship",
"stipend",
"location",
"duration",
"benefits",
"perks",
"certificate",
"opportunity",
"skillzenloop",
"about",
"job",
"strong",
"basic",
"knowledge",
"build",
"back",
]);

const technicalSkillWhitelist = new Set([
"node",
"node.js",
"python",
"java",
"golang",
"typescript",
"javascript",
"react",
"backend",
"frontend",
"api",
"rest",
"restful",
"graphql",
"json",
"sql",
"mysql",
"postgresql",
"postgres",
"mongodb",
"database",
"redis",
"docker",
"kubernetes",
"git",
"github",
"authentication",
"authorization",
"security",
"testing",
"debugging",
"scalability",
"performance",
]);

const capabilityCatalog: Array<{ label: string; keywords: string[] }> = [
{ label: "Backend Development", keywords: ["backend", "server-side", "server", "node", "python", "java"] },
{ label: "API Development", keywords: ["api", "rest", "restful", "json", "endpoint"] },
{ label: "Database Management", keywords: ["database", "mysql", "postgresql", "mongodb", "sql"] },
{ label: "Authentication & Security", keywords: ["authentication", "authorization", "security", "secure", "auth"] },
{ label: "Testing & Debugging", keywords: ["test", "testing", "debug", "bug", "issue"] },
{ label: "Performance & Scalability", keywords: ["performance", "scalability", "optimize", "scalable"] },
{ label: "Version Control", keywords: ["git", "github", "version control"] },
{ label: "Cross-functional Collaboration", keywords: ["collaborate", "frontend", "integration", "team"] },
];

const domainLexicon: Array<{ domain: string; keywords: string[] }> = [
{
domain: "Software Engineering",
keywords: ["react", "typescript", "javascript", "node", "api", "backend", "frontend", "docker", "git", "sql"],
},
{
domain: "Sales",
keywords: ["sales", "quota", "pipeline", "crm", "lead", "prospecting", "closing", "revenue", "account executive"],
},
{
domain: "Marketing",
keywords: ["campaign", "seo", "content", "brand", "ads", "analytics", "social media", "growth"],
},
{
domain: "Data",
keywords: ["python", "machine learning", "dashboard", "tableau", "power bi", "statistics", "analysis", "etl"],
},
{
domain: "Product",
keywords: ["roadmap", "stakeholders", "prioritization", "user research", "product strategy", "experiments"],
},
];

const listOrFallback = (value: unknown, fallback: string[], minItems = 1): string[] => {
if (!Array.isArray(value)) return fallback.slice(0, Math.max(minItems, fallback.length));
const items = value.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean);
if (items.length >= minItems) return items;
return [...items, ...fallback].slice(0, Math.max(minItems, fallback.length));
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, Math.round(value)));

const tokenize = (text: string): string[] =>
text
.toLowerCase()
.split(/[^a-z0-9+.#/-]+/)
.map((token) => token.trim())
.filter((token) => token.length > 2 && !stopwords.has(token) && !jdNoiseTokens.has(token));

const unique = (items: string[]): string[] => [...new Set(items)];

const toSkillLabel = (raw: string): string => {
const text = raw.trim().toLowerCase();
if (!text) return "";
if (technicalSkillWhitelist.has(text)) return raw.trim();
if (text.includes(" ") && text.length >= 8) return raw.trim();
if (text.includes("/") || text.includes(".")) return raw.trim();
return "";
};

const normalizeSkillList = (items: string[]): string[] =>
unique(
items
.map((item) => item.trim())
.filter(Boolean)
.filter((item) => !jdNoiseTokens.has(item.toLowerCase()))
.map(toSkillLabel)
.filter(Boolean),
);

const detectDomain = (text: string): { domain: string; confidence: number; hits: string[] } => {
const lower = text.toLowerCase();
const scored = domainLexicon.map((item) => {
const hits = item.keywords.filter((keyword) => lower.includes(keyword));
return { domain: item.domain, hits, score: hits.length };
});
const best = scored.sort((a, b) => b.score - a.score)[0];
if (!best || best.score === 0) {
return { domain: "General", confidence: 30, hits: [] };
}
const confidence = clamp(35 + best.score * 12, 35, 95);
return { domain: best.domain, confidence, hits: best.hits };
};

const splitLines = (text: string): string[] =>
text
.split(/\r?\n/)
.map((line) => line.trim())
.filter(Boolean);

const isIncludeHeading = (line: string): boolean =>
/^(key responsibilities|responsibilities|required skills|requirements|eligibility criteria|must have|what you.?ll do)/i.test(line);

const isExcludeHeading = (line: string): boolean =>
/^(about the job|location|type|stipend|duration|perks|benefits|about us|who we are)/i.test(line);

const normalizeBulletLine = (line: string): string => line.replace(/^[\-•*\d.)\s]+/, "").trim();

const extractRelevantJobContent = (jobDescription: string): { relevantText: string; relevantLines: string[] } => {
const lines = splitLines(jobDescription);
let includeMode = false;
const relevantLines: string[] = [];

for (const rawLine of lines) {
const line = rawLine.trim();
if (!line) continue;

if (isExcludeHeading(line)) {
includeMode = false;
continue;
}
if (isIncludeHeading(line)) {
includeMode = true;
continue;
}

if (includeMode) {
const normalized = normalizeBulletLine(line);
if (normalized) relevantLines.push(normalized);
}
}

if (relevantLines.length === 0) {
return { relevantText: jobDescription, relevantLines: splitLines(jobDescription).map(normalizeBulletLine) };
}

return { relevantText: relevantLines.join("\n"), relevantLines };
};

const extractCapabilityCoverage = (resumeText: string, relevantJobText: string) => {
const resumeLower = resumeText.toLowerCase();
const jdLower = relevantJobText.toLowerCase();

const required = capabilityCatalog.filter((cap) => cap.keywords.some((keyword) => jdLower.includes(keyword)));
const matched = required.filter((cap) => cap.keywords.some((keyword) => resumeLower.includes(keyword)));
const missing = required.filter((cap) => !matched.includes(cap));

const ratio = required.length > 0 ? matched.length / required.length : 0;
return {
required,
matched,
missing,
ratio,
};
};

const extractImportantJdTerms = (jobDescription: string): string[] => {
const tokens = tokenize(jobDescription);
const frequency = new Map<string, number>();
for (const token of tokens) {
frequency.set(token, (frequency.get(token) ?? 0) + 1);
}
return [...frequency.entries()]
.filter(([token]) => token.length >= 4)
.sort((a, b) => b[1] - a[1])
.map(([token]) => token)
.slice(0, 45);
};

const extractMustHaveTerms = (jobDescription: string): string[] => {
const lower = jobDescription.toLowerCase();
const lines = lower.split(/[\n.;]+/).map((line) => line.trim()).filter(Boolean);
const mustLines = lines.filter((line) => /\b(must|required|requirement|mandatory|need to)\b/.test(line));
return unique(tokenize(mustLines.join(" "))).slice(0, 25);
};

const extractTechFromRelevantLines = (lines: string[]): string[] => {
const joined = lines.join(" ").toLowerCase();
const matched = [...technicalSkillWhitelist].filter((skill) => joined.includes(skill));
return unique(matched.map((skill) => (skill === "node" ? "Node.js" : skill)));
};

const buildHeuristicMatch = (resumeText: string, jobDescription: string) => {
const relevant = extractRelevantJobContent(jobDescription);
const resumeTokens = new Set(tokenize(resumeText));
const jdTerms = extractImportantJdTerms(relevant.relevantText);
const mustHaveTerms = extractMustHaveTerms(relevant.relevantText);
const capabilityCoverage = extractCapabilityCoverage(resumeText, relevant.relevantText);
const requiredTechSkills = extractTechFromRelevantLines(relevant.relevantLines);
const resumeLower = resumeText.toLowerCase();

const overlapTerms = jdTerms.filter((term) => resumeTokens.has(term));
const missingTerms = jdTerms.filter((term) => !resumeTokens.has(term));

const overlapRatio = jdTerms.length > 0 ? overlapTerms.length / jdTerms.length : 0;
const mustHaveCovered = mustHaveTerms.filter((term) => resumeTokens.has(term)).length;
const mustHaveRatio = mustHaveTerms.length > 0 ? mustHaveCovered / mustHaveTerms.length : overlapRatio;

const resumeDomain = detectDomain(resumeText);
const jobDomain = detectDomain(relevant.relevantText);
const domainAligned =
resumeDomain.domain === "General" ||
jobDomain.domain === "General" ||
resumeDomain.domain === jobDomain.domain;
const domainPenalty = domainAligned ? 0 : 34;

const metricCount = (resumeText.match(/\b\d+(?:\.\d+)?%|\$\d+[\d,]*|\b\d+[+]?(?=\s*(?:users|clients|projects|years|months|hours|x)\b)/gi) ?? []).length;
const metricBoost = Math.min(6, metricCount * 0.9);

const rawScore = 6 + overlapRatio * 38 + mustHaveRatio * 32 + capabilityCoverage.ratio * 24 + metricBoost - domainPenalty;
const strictScore = clamp(rawScore, 3, 90);

const categoryScores: MatchCategoryScore[] = [
{
category: "Keyword Coverage",
score: clamp(overlapRatio * 100, 0, 100),
evidence: `${overlapTerms.length}/${jdTerms.length || 1} high-value JD terms matched.`,
},
{
category: "Must-Have Coverage",
score: clamp(mustHaveRatio * 100, 0, 100),
evidence: `${mustHaveCovered}/${mustHaveTerms.length || 1} must-have requirements covered.`,
},
{
category: "Domain Alignment",
score: domainAligned ? clamp((resumeDomain.confidence + jobDomain.confidence) / 2, 45, 95) : 18,
evidence: domainAligned
? `Resume and role both align with ${jobDomain.domain}.`
: `Resume looks ${resumeDomain.domain}, job looks ${jobDomain.domain}.`,
},
{
category: "Core Capability Coverage",
score: clamp(capabilityCoverage.ratio * 100, 0, 100),
evidence: `${capabilityCoverage.matched.length}/${capabilityCoverage.required.length || 1} core role capabilities covered.`,
},
{
category: "Achievement Signals",
score: clamp(35 + metricCount * 8, 20, 92),
evidence: metricCount > 0 ? `${metricCount} quantified impact markers found.` : "Few quantified impact markers found.",
},
];

const matchedTech = requiredTechSkills.filter((skill) => resumeLower.includes(skill.toLowerCase()));
const missingTech = requiredTechSkills.filter((skill) => !resumeLower.includes(skill.toLowerCase()));

const matchedStrengths = [
...capabilityCoverage.matched.map((cap) => `Capability match: ${cap.label}`),
...matchedTech.map((skill) => `Technology match: ${skill}`),
].slice(0, 8);

const missingSkills = normalizeSkillList([
...capabilityCoverage.missing.map((cap) => cap.label),
...missingTech,
...mustHaveTerms,
...missingTerms.slice(0, 20),
]).slice(0, 12);

const criticalGaps: CriticalGap[] = [];
if (!domainAligned) {
criticalGaps.push({
gap: `Domain mismatch (${resumeDomain.domain} vs ${jobDomain.domain})`,
severity: "high",
whyItMatters: "Hiring teams usually screen out candidates whose core domain differs from the role domain.",
});
}
if (mustHaveRatio < 0.45) {
criticalGaps.push({
gap: "Low must-have requirement coverage",
severity: "high",
whyItMatters: "Critical requirements are often hard filters before interviews.",
});
}
if (overlapRatio < 0.35) {
criticalGaps.push({
gap: "Low keyword overlap with JD",
severity: "medium",
whyItMatters: "ATS ranking and recruiter confidence both depend on role-relevant keyword presence.",
});
}
if (capabilityCoverage.ratio < 0.5) {
criticalGaps.push({
gap: "Low core capability coverage",
severity: "high",
whyItMatters: "Even with some keyword overlap, missing core capabilities lowers true role readiness.",
});
}

return {
strictScore,
domainAlignment: {
resumeDomain: resumeDomain.domain,
jobDomain: jobDomain.domain,
isAligned: domainAligned,
confidence: clamp((resumeDomain.confidence + jobDomain.confidence) / 2, 20, 98),
rationale: domainAligned
? `Both resume and job description indicate ${jobDomain.domain} patterns.`
: `Resume content strongly indicates ${resumeDomain.domain} while job requires ${jobDomain.domain}.`,
},
categoryScores,
matchedStrengths,
missingSkills,
criticalGaps,
requiredTechSkills,
matchedTech,
missingTech,
};
};

const normalizeCategoryScores = (value: unknown, fallback: MatchCategoryScore[]): MatchCategoryScore[] => {
if (!Array.isArray(value)) return fallback;
const normalized = value
.map((item): MatchCategoryScore | null => {
if (!item || typeof item !== "object") return null;
const typed = item as Partial<MatchCategoryScore>;
const category = typeof typed.category === "string" ? typed.category.trim() : "";
const evidence = typeof typed.evidence === "string" ? typed.evidence.trim() : "";
if (!category || !evidence) return null;
return { category, evidence, score: clamp(Number(typed.score ?? 0), 0, 100) };
})
.filter((item): item is MatchCategoryScore => item !== null);

return normalized.length > 0 ? normalized : fallback;
};

const normalizeDomainAlignment = (value: unknown, fallback: DomainAlignment): DomainAlignment => {
if (!value || typeof value !== "object") return fallback;
const typed = value as Partial<DomainAlignment>;
const resumeDomain = typeof typed.resumeDomain === "string" && typed.resumeDomain.trim() ? typed.resumeDomain : fallback.resumeDomain;
const jobDomain = typeof typed.jobDomain === "string" && typed.jobDomain.trim() ? typed.jobDomain : fallback.jobDomain;
const rationale = typeof typed.rationale === "string" && typed.rationale.trim() ? typed.rationale : fallback.rationale;
const confidence = clamp(Number(typed.confidence ?? fallback.confidence), 0, 100);
const isAligned = typeof typed.isAligned === "boolean" ? typed.isAligned : fallback.isAligned;
return { resumeDomain, jobDomain, rationale, confidence, isAligned };
};

const normalizeCriticalGaps = (value: unknown, fallback: CriticalGap[]): CriticalGap[] => {
if (!Array.isArray(value)) return fallback;
const normalized = value
.map((item): CriticalGap | null => {
if (!item || typeof item !== "object") return null;
const typed = item as Partial<CriticalGap>;
const gap = typeof typed.gap === "string" ? typed.gap.trim() : "";
const whyItMatters = typeof typed.whyItMatters === "string" ? typed.whyItMatters.trim() : "";
if (!gap || !whyItMatters) return null;
const severity: Severity =
typed.severity === "high" || typed.severity === "medium" || typed.severity === "low"
? typed.severity
: "medium";
return { gap, whyItMatters, severity };
})
.filter((item): item is CriticalGap => item !== null);
return normalized.length > 0 ? normalized : fallback;
};

const normalizeMatchStrengths = (value: unknown, fallback: string[]): string[] => {
const preferred = listOrFallback(value, fallback, 2);
const filtered = preferred.filter((item) => !jdNoiseTokens.has(item.toLowerCase()));
return filtered.length > 0 ? filtered : fallback;
};

const normalizeMissingSkills = (value: unknown, fallback: string[]): string[] => {
const preferred = listOrFallback(value, fallback, 4);
const normalized = normalizeSkillList(preferred);
if (normalized.length >= 3) return normalized;
const fallbackNormalized = normalizeSkillList(fallback);
return fallbackNormalized.length > 0 ? fallbackNormalized.slice(0, 12) : ["Core capability gap identified"];
};

const normalizeExtractedRequirements = (
value: unknown,
fallback: ExtractedJobRequirements,
): ExtractedJobRequirements => {
if (!value || typeof value !== "object") return fallback;
const typed = value as Partial<ExtractedJobRequirements>;

const roleTitle =
typeof typed.roleTitle === "string" && typed.roleTitle.trim()
? typed.roleTitle.trim()
: fallback.roleTitle;
const jobDomain =
typeof typed.jobDomain === "string" && typed.jobDomain.trim()
? typed.jobDomain.trim()
: fallback.jobDomain;

const coreSkills = normalizeSkillList(
listOrFallback(typed.coreSkills, fallback.coreSkills, 4),
).slice(0, 16);

const mustHaveRequirements = listOrFallback(
typed.mustHaveRequirements,
fallback.mustHaveRequirements,
3,
)
.filter((item) => !jdNoiseTokens.has(item.toLowerCase()))
.slice(0, 12);

const responsibilities = listOrFallback(
typed.responsibilities,
fallback.responsibilities,
3,
)
.filter((item) => !jdNoiseTokens.has(item.toLowerCase()))
.slice(0, 12);

const exclusionTerms = normalizeSkillList(
listOrFallback(typed.exclusionTerms, fallback.exclusionTerms, 0),
).slice(0, 10);

return {
roleTitle,
jobDomain,
coreSkills: coreSkills.length > 0 ? coreSkills : fallback.coreSkills,
mustHaveRequirements,
responsibilities,
exclusionTerms,
};
};

const extractRequirementsWithLlm = async (
jobDescription: string,
fallbackSkills: string[],
fallbackMustHave: string[],
fallbackResponsibilities: string[],
fallbackDomain: string,
): Promise<ExtractedJobRequirements> => {
const fallback: ExtractedJobRequirements = {
roleTitle: "Target Role",
jobDomain: fallbackDomain,
coreSkills: fallbackSkills.slice(0, 12),
mustHaveRequirements: fallbackMustHave.slice(0, 10),
responsibilities: fallbackResponsibilities.slice(0, 10),
exclusionTerms: [],
};

const prompt = `You are an expert job requirement parser.
Extract ONLY the true role requirements from this JD and return ONLY valid JSON with these exact keys:
- roleTitle: string
- jobDomain: string
- coreSkills: string[] (6-16 technical/capability skills only)
- mustHaveRequirements: string[] (4-12 mandatory requirements)
- responsibilities: string[] (4-12 core responsibilities)
- exclusionTerms: string[] (metadata/noise terms that should NOT be treated as skills)

Rules:
1) Ignore metadata/perks text: location, stipend, duration, company name, remote/full-time labels.
2) coreSkills must contain technologies/capabilities only.
3) No markdown, no code fences, JSON only.

Job Description:
${jobDescription}`;

const parsed = await requestStructuredJson<ExtractedJobRequirements>(prompt, fallback);
return normalizeExtractedRequirements(parsed as unknown, fallback);
};

export const matchResumeToJob = async (
resumeText: string,
jobDescription: string,
): Promise<JobMatchResult> => {
const safeResume = sanitizeUserInput(resumeText);
const safeJobDescription = sanitizeUserInput(jobDescription);
const heuristic = buildHeuristicMatch(safeResume, safeJobDescription);
const relevant = extractRelevantJobContent(safeJobDescription);
const llmRequirements = await extractRequirementsWithLlm(
safeJobDescription,
heuristic.requiredTechSkills,
extractMustHaveTerms(relevant.relevantText),
relevant.relevantLines,
heuristic.domainAlignment.jobDomain,
);
const resumeLower = safeResume.toLowerCase();
const llmMatchedSkills = llmRequirements.coreSkills.filter((skill) => resumeLower.includes(skill.toLowerCase()));
const llmMissingSkills = llmRequirements.coreSkills.filter((skill) => !resumeLower.includes(skill.toLowerCase()));
const llmCoverageRatio = llmRequirements.coreSkills.length > 0 ? llmMatchedSkills.length / llmRequirements.coreSkills.length : 0;

const fallback: JobMatchResult = {
matchPercentage: heuristic.strictScore,
headline: heuristic.domainAlignment.isAligned
? "Match is evidence-driven but strict; key requirement gaps still reduce confidence."
: "Low role fit due to clear domain mismatch and missing must-have requirements.",
fitSummary: heuristic.domainAlignment.isAligned
? "The resume has partial alignment with the role, but strict screening indicates meaningful requirement gaps."
: "The resume appears to target a different domain than the current job description, so this role is likely not a shortlist fit yet.",
recommendation: heuristic.strictScore >= 72 ? "Strong fit" : heuristic.strictScore >= 48 ? "Borderline fit" : "Weak fit",
extractedRequirements: llmRequirements,
domainAlignment: heuristic.domainAlignment,
categoryScores: heuristic.categoryScores,
matchedStrengths:
heuristic.matchedStrengths.length > 0
? heuristic.matchedStrengths
: ["Very limited direct requirement matches were found in the resume."],
missingSkills: llmMissingSkills.length > 0 ? llmMissingSkills : heuristic.missingSkills,
criticalGaps:
heuristic.criticalGaps.length > 0
? heuristic.criticalGaps
: [
{
gap: "No high-severity blockers detected",
severity: "low",
whyItMatters: "Focus on strengthening evidence and role-specific phrasing.",
},
],
suggestions: [
"Mirror must-have requirements in your top experience bullets with concrete evidence.",
"Add 3-5 role-specific keywords from the JD across summary, skills, and projects.",
"Rewrite weak bullets into outcome-focused statements with metrics.",
"If domain mismatch is large, use a role-bridging summary and transferable achievements.",
"Prioritize missing core capabilities before applying to this role.",
],
};

const prompt = `You are a strict technical recruiter.
Assess resume fit against the job description and return ONLY valid JSON with these exact keys:
- matchPercentage: number (0-100, strict scoring)
- headline: string (specific and evidence-based)
- fitSummary: string (2-5 sentences with rationale)
- recommendation: string (one of: Strong fit, Borderline fit, Weak fit)
- domainAlignment: { resumeDomain:string, jobDomain:string, isAligned:boolean, confidence:number, rationale:string }
- categoryScores: array of 4-6 objects { category:string, score:number, evidence:string }
- matchedStrengths: string[] (4-8 direct evidence points)
- missingSkills: string[] (6-12 specific missing requirements)
- criticalGaps: array of 2-6 objects { gap:string, severity:low|medium|high, whyItMatters:string }
- suggestions: string[] (6-10 targeted fixes)

Rules:
1) Be strict, avoid inflated scores.
2) If domains mismatch (e.g., web developer vs sales manager), score should usually be low.
3) Do not use generic statements.
4) Ignore metadata/perks/company text (location, stipend, duration, perks, company name, remote/full-time labels).
5) missingSkills must contain capabilities/tools/technical concepts only (no adjectives like strong/basic, no metadata terms).
6) No markdown, no code fences, JSON only.

Resume:
${safeResume}

Job Description:
${safeJobDescription}`;

const result = await requestStructuredJson<JobMatchResult>(prompt, fallback);
const resultRecord = result as unknown as Record<string, unknown>;
const llmScore = clamp(Number(resultRecord.matchPercentage ?? fallback.matchPercentage), 0, 100);

let blendedScore = Math.round(llmScore * 0.4 + heuristic.strictScore * 0.6);
if (llmCoverageRatio < 0.45) {
blendedScore = Math.min(blendedScore, 42);
}
if (!heuristic.domainAlignment.isAligned && blendedScore > 28) {
blendedScore = 28;
}

const recommendation =
blendedScore >= 72 ? "Strong fit" : blendedScore >= 48 ? "Borderline fit" : "Weak fit";

return {
matchPercentage: clamp(blendedScore, 5, 93),
headline: typeof resultRecord.headline === "string" && resultRecord.headline.trim() ? resultRecord.headline : fallback.headline,
fitSummary: typeof resultRecord.fitSummary === "string" && resultRecord.fitSummary.trim() ? resultRecord.fitSummary : fallback.fitSummary,
recommendation:
typeof resultRecord.recommendation === "string" && resultRecord.recommendation.trim()
? resultRecord.recommendation
: recommendation,
extractedRequirements: normalizeExtractedRequirements(
resultRecord.extractedRequirements,
fallback.extractedRequirements,
),
domainAlignment: normalizeDomainAlignment(resultRecord.domainAlignment, fallback.domainAlignment),
categoryScores: normalizeCategoryScores(resultRecord.categoryScores, fallback.categoryScores),
matchedStrengths: normalizeMatchStrengths(
resultRecord.matchedStrengths,
[
...llmMatchedSkills.map((skill) => `Core requirement matched: ${skill}`),
...fallback.matchedStrengths,
],
),
missingSkills: normalizeMissingSkills(
resultRecord.missingSkills,
llmMissingSkills.length > 0 ? llmMissingSkills : fallback.missingSkills,
),
criticalGaps: normalizeCriticalGaps(resultRecord.criticalGaps, fallback.criticalGaps),
suggestions: listOrFallback(resultRecord.suggestions, fallback.suggestions, 4),
};
};
