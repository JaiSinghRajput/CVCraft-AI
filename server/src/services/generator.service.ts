import { requestStructuredJson } from "../lib/openai";
import { env } from "../lib/env";
import { sanitizeUserInput } from "../lib/prompt-guard";
import { renderResumePdf } from "../lib/resume-pdf";

interface JobProfile {
	isTechJob: boolean;
	roleTitle: string;
	primaryKeywords: string[];
}

interface GithubRepo {
	name: string;
	description: string;
	html_url: string;
	language: string | null;
	stargazers_count: number;
	forks_count: number;
	watchers_count: number;
	open_issues_count: number;
	size: number;
	topics?: string[];
	updated_at: string;
	archived: boolean;
	fork: boolean;
}

interface GithubProjectInsight {
	name: string;
	url: string;
	description: string;
	language: string;
	relevanceScore: number;
	metrics: {
		stars: number;
		forks: number;
		watchers: number;
		openIssues: number;
		repoSizeKb: number;
		estimatedDeliveryImpact: number;
	};
	resumeBullets: string[];
}

interface StructuredResumeSection {
	heading: string;
	bullets: string[];
}

interface StructuredResume {
	title: string;
	summary: string;
	sections: StructuredResumeSection[];
	plainTextResume: string;
	subtitle?: string;
	contactLine?: string;
}

interface ParsedExperience {
	company: string;
	role: string;
	duration: string;
	location: string;
}

interface ParsedEducation {
	institution: string;
	program: string;
}

interface ParsedLinkedInProfile {
	name: string;
	headline: string;
	location: string;
	contactLine: string;
	topSkills: string[];
	experience: ParsedExperience[];
	education: ParsedEducation[];
}

export interface ResumeGenerationResult {
	title: string;
	summary: string;
	sections: Array<{ heading: string; bullets: string[] }>;
	plainTextResume: string;
	isTechJob: boolean;
	requiresGithubUsername: boolean;
	githubUsername?: string;
	githubProjectsUsed: GithubProjectInsight[];
	pdfBase64?: string;
	pdfFileName?: string;
}

const STOP_WORDS = new Set([
	"the",
	"and",
	"with",
	"from",
	"that",
	"this",
	"your",
	"have",
	"will",
	"for",
	"you",
	"our",
	"into",
	"across",
	"using",
	"years",
	"year",
	"work",
	"role",
	"team",
	"plus",
	"good",
	"must",
	"able",
	"required",
	"preferred",
	"experience",
	"skills",
	"knowledge",
	"job",
	"description",
	"candidate",
	"responsibilities",
	"qualification",
]);

const TECH_KEYWORDS = [
	"software",
	"developer",
	"engineer",
	"frontend",
	"backend",
	"fullstack",
	"full-stack",
	"typescript",
	"javascript",
	"react",
	"node",
	"python",
	"java",
	"cloud",
	"devops",
	"api",
	"microservice",
	"aws",
	"azure",
	"docker",
	"kubernetes",
	"data engineering",
	"machine learning",
	"ai",
	"qa automation",
	"cybersecurity",
];

const roleSlug = (title: string): string =>
	title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "") || "tailored-resume";

const normalizeLines = (text: string): string => text.replace(/\r/g, "").trim();

const profileSafeText = (input: string): string =>
	input
		.replace(/```/g, " ")
		.replace(/<script/gi, " ")
		.slice(0, 16000);

const extractKeywords = (input: string, limit = 20): string[] => {
	const tokens = input
		.toLowerCase()
		.replace(/[^a-z0-9\s+#./-]/g, " ")
		.split(/\s+/)
		.map((word) => word.trim())
		.filter((word) => word.length >= 3 && !STOP_WORDS.has(word));

	const frequency = new Map<string, number>();
	for (const token of tokens) {
		frequency.set(token, (frequency.get(token) ?? 0) + 1);
	}

	return [...frequency.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, limit)
		.map(([token]) => token);
};

const toProfileLines = (raw: string): string[] =>
	normalizeLines(raw)
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);

const sectionIndex = (lines: string[], marker: string): number =>
	lines.findIndex((line) => line.toLowerCase() === marker.toLowerCase());

const looksLikeName = (line: string): boolean => {
	if (!line || line.length < 3 || line.length > 48) {
		return false;
	}
	if (/[\d@]/.test(line)) {
		return false;
	}
	if (["contact", "top skills", "experience", "education"].includes(line.toLowerCase())) {
		return false;
	}
	const words = line.split(/\s+/).filter(Boolean);
	if (words.length < 2 || words.length > 4) {
		return false;
	}
	return words.every((word) => /^[A-Za-z.'-]+$/.test(word));
};

const pickName = (lines: string[]): string => {
	const uppercaseCandidate = lines.find((line) => {
		const letters = line.replace(/[^A-Za-z]/g, "");
		if (letters.length < 4 || letters.length > 28) {
			return false;
		}
		return letters === letters.toUpperCase() && looksLikeName(line);
	});
	if (uppercaseCandidate) {
		return uppercaseCandidate;
	}

	const titled = lines.find((line) => looksLikeName(line) && /[A-Z]/.test(line[0] ?? ""));
	return titled ?? "Candidate";
};

const parseExperience = (lines: string[]): ParsedExperience[] => {
	const start = sectionIndex(lines, "Experience");
	const end = sectionIndex(lines, "Education");
	if (start < 0) {
		return [];
	}

	const block = lines.slice(start + 1, end > start ? end : undefined);
	const parsed: ParsedExperience[] = [];

	for (let i = 0; i < block.length; ) {
		const company = block[i] ?? "";
		const role = block[i + 1] ?? "";
		const duration = block[i + 2] ?? "";
		const location = block[i + 3] ?? "";

		if (!company) {
			i += 1;
			continue;
		}

		const looksLikeEntry = role.length > 1 && /developer|engineer|intern|analyst|manager|designer|lead|specialist/i.test(role);
		if (looksLikeEntry) {
			parsed.push({ company, role, duration, location });
			i += 4;
			continue;
		}

		if (company.length > 3 && role.length > 3) {
			parsed.push({ company, role, duration: "", location: duration || location });
			i += 2;
			continue;
		}

		i += 1;
	}

	return parsed.slice(0, 8);
};

const parseEducation = (lines: string[]): ParsedEducation[] => {
	const start = sectionIndex(lines, "Education");
	if (start < 0) {
		return [];
	}

	const block = lines.slice(start + 1);
	const parsed: ParsedEducation[] = [];

	for (let i = 0; i < block.length; ) {
		const institution = block[i] ?? "";
		if (!institution) {
			i += 1;
			continue;
		}
		const program = block[i + 1] ?? "";
		parsed.push({ institution, program });
		i += 2;
	}

	return parsed.slice(0, 6);
};

const parseTopSkills = (lines: string[]): string[] => {
	const start = sectionIndex(lines, "Top Skills");
	if (start < 0) {
		return [];
	}

	const collected: string[] = [];
	for (let i = start + 1; i < lines.length; i += 1) {
		const line = lines[i];
		if (!line) {
			break;
		}
		if (["experience", "education", "contact"].includes(line.toLowerCase())) {
			break;
		}
		if (looksLikeName(line)) {
			break;
		}
		if (line.length <= 32 && !line.includes("(")) {
			collected.push(line);
		}
		if (collected.length >= 12) {
			break;
		}
	}

	return collected;
};

const parseLinkedInProfile = (linkedinText: string): ParsedLinkedInProfile => {
	const raw = profileSafeText(linkedinText);
	const lines = toProfileLines(raw);
	const lower = raw.toLowerCase();

	const email = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)?.[0] ?? "";
	const linkedInUrl = raw.match(/https?:\/\/(?:www\.)?linkedin\.com\/[^\s)]+/i)?.[0] ?? "";
	const phone = raw.match(/(?:\+?\d[\d\s().-]{7,}\d)/)?.[0] ?? "";
	const name = pickName(lines);

	const locationLine = lines.find((line) => /,/.test(line) && /india|usa|uk|canada|germany|australia|uae|singapore/i.test(line))
		?? lines.find((line) => /,/.test(line) && line.length <= 70)
		?? "";

	const nameIdx = lines.findIndex((line) => line === name);
	let headline = "";
	if (nameIdx >= 0) {
		const headlineLines = lines.slice(nameIdx + 1, Math.min(lines.length, nameIdx + 5));
		headline = headlineLines.filter((line) => line !== locationLine && !/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(line)).join(" ").trim();
	}
	if (!headline) {
		headline = lines.find((line) => line.toLowerCase().includes("developer") || line.toLowerCase().includes("engineer")) ?? "Professional profile";
	}

	const contactParts = [email, phone, linkedInUrl, locationLine].filter(Boolean);
	const topSkills = parseTopSkills(lines);
	const experience = parseExperience(lines);
	const education = parseEducation(lines);

	if (!topSkills.length && lower.includes("skills")) {
		topSkills.push(...extractKeywords(raw, 8));
	}

	return {
		name,
		headline,
		location: locationLine,
		contactLine: contactParts.join(" | "),
		topSkills,
		experience,
		education,
	};
};

const buildBaselineResume = (
	profile: ParsedLinkedInProfile,
	jobProfile: JobProfile,
	githubProjects: GithubProjectInsight[],
	jdKeywords: string[],
): StructuredResume => {
	const skills = [...profile.topSkills, ...jdKeywords]
		.map((item) => item.trim())
		.filter(Boolean)
		.filter((item, index, arr) => arr.findIndex((x) => x.toLowerCase() === item.toLowerCase()) === index)
		.slice(0, 12);

	const experienceBullets = profile.experience.length
		? profile.experience.flatMap((entry) => {
			const primary = `${entry.role} at ${entry.company}${entry.duration ? ` (${entry.duration})` : ""}${entry.location ? ` - ${entry.location}` : ""}.`;
			const tailored = `Applied ${jobProfile.primaryKeywords.slice(0, 3).join(", ") || "role-aligned engineering capabilities"} to deliver production-ready outputs.`;
			return [primary, tailored];
		})
		: [
			"No explicit work history detected in LinkedIn PDF. Add internships or projects with measurable outcomes.",
		];

	const educationBullets = profile.education.length
		? profile.education.map((entry) => `${entry.program ? `${entry.program} - ` : ""}${entry.institution}`)
		: ["Add your degree, institution, and expected graduation date."];

	const sections: StructuredResumeSection[] = [
		{
			heading: "Core Skills",
			bullets: skills.length ? skills : ["Communication", "Problem Solving", "Execution"],
		},
		{
			heading: "Experience",
			bullets: experienceBullets.slice(0, 10),
		},
		{
			heading: "Education",
			bullets: educationBullets,
		},
	];

	if (githubProjects.length) {
		sections.push({
			heading: "Projects",
			bullets: githubProjects.map(
				(project) =>
					`${project.name}: ${project.description} (stack ${project.language}, stars ${project.metrics.stars}, forks ${project.metrics.forks}, relevance ${project.relevanceScore}/100).`,
			),
		});
	}

	const summaryParts = [
		profile.headline,
		profile.experience.length ? `${profile.experience.length}+ practical role experience(s).` : "Hands-on builder profile.",
		jobProfile.roleTitle ? `Targeting ${jobProfile.roleTitle} opportunities.` : "",
	].filter(Boolean);

	const title = profile.name || `${jobProfile.roleTitle} Candidate`;
	const summary = summaryParts.join(" ").trim() || "Professional profile tailored to the target role.";

	return {
		title,
		summary,
		subtitle: profile.headline || jobProfile.roleTitle,
		contactLine: profile.contactLine,
		sections,
		plainTextResume: "",
	};
};

const computeRelevance = (repo: GithubRepo, jdKeywords: string[]): number => {
	const content = `${repo.name} ${repo.description ?? ""} ${repo.language ?? ""} ${(repo.topics ?? []).join(" ")}`.toLowerCase();
	let score = 0;

	for (const keyword of jdKeywords) {
		if (content.includes(keyword)) {
			score += keyword.length > 6 ? 11 : 7;
		}
	}

	if (repo.language && jdKeywords.includes(repo.language.toLowerCase())) {
		score += 12;
	}

	score += Math.min(18, repo.stargazers_count * 0.6);
	score += Math.min(12, repo.forks_count * 0.9);
	score += Math.max(0, 8 - repo.open_issues_count * 0.25);

	return Math.max(0, Math.min(100, Math.round(score)));
};

const inferImpact = (repo: GithubRepo, relevanceScore: number): number => {
	const impact = 38 + relevanceScore * 0.42 + repo.stargazers_count * 0.45 + repo.forks_count * 0.75;
	return Math.max(35, Math.min(95, Math.round(impact)));
};

const extractJobProfile = async (jobDescription: string): Promise<JobProfile> => {
	const keywordHits = TECH_KEYWORDS.filter((keyword) => jobDescription.toLowerCase().includes(keyword)).length;
	const heuristicTech = keywordHits >= 2;
	const fallback: JobProfile = {
		isTechJob: heuristicTech,
		roleTitle: heuristicTech ? "Software Engineer" : "Professional",
		primaryKeywords: extractKeywords(jobDescription, 14),
	};

	const prompt = `Analyze this job description and return JSON with keys:
isTechJob (boolean), roleTitle (string), primaryKeywords (string[]).
primaryKeywords must contain concrete capability keywords only.
Job Description:
${jobDescription}`;

	const parsed = await requestStructuredJson<JobProfile>(prompt, fallback);
	return {
		isTechJob: Boolean(parsed.isTechJob),
		roleTitle: typeof parsed.roleTitle === "string" && parsed.roleTitle.trim() ? parsed.roleTitle.trim() : fallback.roleTitle,
		primaryKeywords: Array.isArray(parsed.primaryKeywords) && parsed.primaryKeywords.length
			? parsed.primaryKeywords
				.filter((item): item is string => typeof item === "string")
				.map((item) => item.trim().toLowerCase())
				.filter(Boolean)
				.slice(0, 20)
			: fallback.primaryKeywords,
	};
};

const fetchGithubProjects = async (
	githubUsername: string,
	jdKeywords: string[],
): Promise<GithubProjectInsight[]> => {
	const cleanUsername = githubUsername.trim();
	if (!cleanUsername) {
		return [];
	}

	const headers: Record<string, string> = {
		Accept: "application/vnd.github+json",
		"User-Agent": "cvcraft-ai-resume-builder",
	};

	if (env.githubToken) {
		headers.Authorization = `Bearer ${env.githubToken}`;
	}

	const response = await fetch(`https://api.github.com/users/${encodeURIComponent(cleanUsername)}/repos?per_page=100&sort=updated`, {
		headers,
	});

	if (!response.ok) {
		return [];
	}

	const repos = (await response.json()) as GithubRepo[];
	const candidates = repos.filter((repo) => {
		const description = (repo.description ?? "").trim();
		return !repo.archived && !repo.fork && description.length >= 18;
	});

	const ranked = candidates
		.map((repo) => {
			const relevanceScore = computeRelevance(repo, jdKeywords);
			const impact = inferImpact(repo, relevanceScore);
			const language = repo.language ?? "Technology Stack Not Public";
			return {
				name: repo.name,
				url: repo.html_url,
				description: repo.description,
				language,
				relevanceScore,
				metrics: {
					stars: repo.stargazers_count,
					forks: repo.forks_count,
					watchers: repo.watchers_count,
					openIssues: repo.open_issues_count,
					repoSizeKb: repo.size,
					estimatedDeliveryImpact: impact,
				},
				resumeBullets: [
					`${repo.description}`,
					`JD relevance score ${relevanceScore}/100 using role keywords and stack alignment.`,
					`Repo metrics: ${repo.stargazers_count} stars, ${repo.forks_count} forks, ${repo.watchers_count} watchers, ~${Math.max(1, Math.round(repo.size / 1024))} MB codebase.` ,
				],
			} satisfies GithubProjectInsight;
		})
		.sort((a, b) => b.relevanceScore - a.relevanceScore)
		.slice(0, 5);

	return ranked;
};

const ensureSection = (
	sections: StructuredResumeSection[],
	heading: string,
	builtBullets: string[],
): StructuredResumeSection[] => {
	const filteredBullets = builtBullets.map((item) => item.trim()).filter(Boolean);
	if (!filteredBullets.length) {
		return sections;
	}

	const existing = sections.find((section) => section.heading.toLowerCase() === heading.toLowerCase());
	if (existing) {
		existing.bullets = [...existing.bullets, ...filteredBullets].slice(0, 8);
		return sections;
	}

	sections.push({ heading, bullets: filteredBullets.slice(0, 8) });
	return sections;
};

const buildPlainTextResume = (resume: StructuredResume): string => {
	const lines: string[] = [];
	lines.push(resume.title || "Tailored Resume");
	lines.push("");
	if (resume.summary) {
		lines.push("PROFESSIONAL SUMMARY");
		lines.push(resume.summary);
		lines.push("");
	}

	for (const section of resume.sections) {
		lines.push((section.heading || "Section").toUpperCase());
		for (const bullet of section.bullets) {
			lines.push(`- ${bullet}`);
		}
		lines.push("");
	}

	return normalizeLines(lines.join("\n"));
};

export const generateTailoredResume = async (
	linkedinText: string,
	jobDescription: string,
	githubUsername?: string,
): Promise<ResumeGenerationResult> => {
	const safeJobDescription = sanitizeUserInput(jobDescription);
	const safeGithubUsername = sanitizeUserInput(githubUsername ?? "");
	const jobProfile = await extractJobProfile(safeJobDescription);
	const parsedProfile = parseLinkedInProfile(linkedinText);

	const githubProjects =
		jobProfile.isTechJob && safeGithubUsername
			? await fetchGithubProjects(safeGithubUsername, jobProfile.primaryKeywords)
			: [];

	const baselineResume = buildBaselineResume(parsedProfile, jobProfile, githubProjects, jobProfile.primaryKeywords);

	const fallback: ResumeGenerationResult = {
		title: baselineResume.title,
		summary: baselineResume.summary,
		sections: baselineResume.sections,
		plainTextResume: buildPlainTextResume({ ...baselineResume, plainTextResume: "" }),
		isTechJob: jobProfile.isTechJob,
		requiresGithubUsername: jobProfile.isTechJob,
		githubUsername: safeGithubUsername || undefined,
		githubProjectsUsed: githubProjects,
		pdfBase64: undefined,
		pdfFileName: undefined,
	};

const githubContext = githubProjects.length
	? githubProjects
			.map(
				(project, index) =>
					`${index + 1}. ${project.name} (${project.language})\nDescription: ${project.description}\nURL: ${project.url}\nMetrics: stars=${project.metrics.stars}, forks=${project.metrics.forks}, watchers=${project.metrics.watchers}, openIssues=${project.metrics.openIssues}, relevance=${project.relevanceScore}/100, estimatedDeliveryImpact=${project.metrics.estimatedDeliveryImpact}/100`,
			)
			.join("\n\n")
	: "No GitHub projects available or provided.";

	const prompt = `Create a one-page ATS-friendly resume tailored to the job description from the LinkedIn profile text.
Return ONLY JSON with keys: title (string), summary (string), sections (array of {heading:string, bullets:string[]}), plainTextResume (string).
Rules:
- Resume must have strong hierarchy and polished formatting-friendly headings.
- Include essential resume sections: Professional Summary, Core Skills, Experience, Projects (when relevant), Education, Certifications/Achievements (if data exists).
- Bullets must be concise, action-oriented, and metric-driven.
- For tech jobs, incorporate matching GitHub projects into a dedicated Projects section with role relevance and metrics.
- Do not invent fake employers or degrees. If missing, write concise placeholders that can be edited.

Use this parsed baseline resume data and improve wording, relevance, and ATS quality while preserving factual details:
${JSON.stringify({
	name: parsedProfile.name,
	headline: parsedProfile.headline,
	contactLine: parsedProfile.contactLine,
	topSkills: parsedProfile.topSkills,
	experience: parsedProfile.experience,
	education: parsedProfile.education,
	baseline: baselineResume,
})}

LinkedIn:
${profileSafeText(linkedinText)}

Job Description:
${safeJobDescription}

Tech Job: ${jobProfile.isTechJob ? "yes" : "no"}
GitHub Username: ${safeGithubUsername || "not provided"}

Selected GitHub Projects:
${githubContext}`;

	const generated = await requestStructuredJson<StructuredResume>(prompt, {
		title: baselineResume.title,
		summary: baselineResume.summary,
		subtitle: baselineResume.subtitle,
		contactLine: baselineResume.contactLine,
		sections: baselineResume.sections,
		plainTextResume: buildPlainTextResume({ ...baselineResume, plainTextResume: "" }),
	});

	const sections = Array.isArray(generated.sections)
		? generated.sections
				.filter((section): section is StructuredResumeSection => Boolean(section?.heading))
				.map((section) => ({
					heading: section.heading.trim(),
					bullets: Array.isArray(section.bullets)
						? section.bullets.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
						: [],
				}))
		: [];

	if (githubProjects.length) {
		const projectBullets = githubProjects.map(
			(project) =>
				`${project.name}: ${project.description} (relevance ${project.relevanceScore}/100, stars ${project.metrics.stars}, forks ${project.metrics.forks}, estimated delivery impact ${project.metrics.estimatedDeliveryImpact}/100).`,
		);
		ensureSection(sections, "Projects", projectBullets);
	}

	if (!sections.length) {
		sections.push(...baselineResume.sections);
	}

	const dedupedSections = sections.filter(
		(section, index, all) =>
			all.findIndex((other) => other.heading.toLowerCase() === section.heading.toLowerCase()) === index,
	);

	const summary = (generated.summary ?? "").trim() || baselineResume.summary;
	const title = (generated.title ?? "").trim() || baselineResume.title || `${jobProfile.roleTitle} Resume`;
	const subtitle = (generated.subtitle ?? "").trim() || baselineResume.subtitle || jobProfile.roleTitle;
	const contactLine = (generated.contactLine ?? "").trim() || baselineResume.contactLine;
	const plainTextResume = (generated.plainTextResume ?? "").trim() || buildPlainTextResume({ title, summary, sections: dedupedSections, plainTextResume: "" });

	const pdfBuffer = await renderResumePdf({
		title,
		subtitle,
		contactLine,
		summary,
		sections: dedupedSections,
	});

	return {
		title,
		summary,
		sections: dedupedSections,
		plainTextResume,
		isTechJob: jobProfile.isTechJob,
		requiresGithubUsername: jobProfile.isTechJob,
		githubUsername: safeGithubUsername || undefined,
		githubProjectsUsed: githubProjects,
		pdfBase64: pdfBuffer.toString("base64"),
		pdfFileName: `${roleSlug(jobProfile.roleTitle)}-resume.pdf`,
	};
};
