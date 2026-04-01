import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { fetchJob } from "../lib/api";
import type { JobResponse } from "../lib/api";

type RiskLevel = "low" | "medium" | "high";

interface SectionRating {
section?: string;
score?: number;
summary?: string;
riskLevel?: RiskLevel;
}

interface ProfileFit {
profile?: string;
fitPercentage?: number;
reason?: string;
}

interface GrammarImprovement {
issue?: string;
suggestion?: string;
riskLevel?: RiskLevel;
example?: string;
}

interface AtsImprovement {
issue?: string;
impact?: string;
riskLevel?: RiskLevel;
fix?: string;
}

interface CoreImprovement {
area?: string;
riskLevel?: RiskLevel;
actions?: string[];
expectedOutcome?: string;
}

interface ResumeAnalysisResult {
atsScore?: number;
headline?: string;
sectionRatings?: SectionRating[];
strictFittingProfiles?: ProfileFit[];
goodPoints?: string[];
grammarImprovements?: GrammarImprovement[];
atsImprovements?: AtsImprovement[];
overallRiskLevel?: RiskLevel;
coreImprovements?: CoreImprovement[];
suggestions?: string[];
next7Days?: string[];
fitSummary?: string;
}

interface JobMatchResult {
matchPercentage?: number;
headline?: string;
recommendation?: string;
extractedRequirements?: {
roleTitle?: string;
jobDomain?: string;
coreSkills?: string[];
mustHaveRequirements?: string[];
responsibilities?: string[];
exclusionTerms?: string[];
};
domainAlignment?: {
resumeDomain?: string;
jobDomain?: string;
isAligned?: boolean;
confidence?: number;
rationale?: string;
};
categoryScores?: Array<{ category?: string; score?: number; evidence?: string }>;
matchedStrengths?: string[];
missingSkills?: string[];
criticalGaps?: Array<{ gap?: string; severity?: RiskLevel; whyItMatters?: string }>;
fitSummary?: string;
suggestions?: string[];
}

interface ResumeGenerationResult {
title?: string;
subtitle?: string;
contactLine?: string;
summary?: string;
sections?: Array<{ heading?: string; bullets?: string[] }>;
plainTextResume?: string;
isTechJob?: boolean;
requiresGithubUsername?: boolean;
githubUsername?: string;
githubProjectsUsed?: Array<{
name?: string;
url?: string;
description?: string;
language?: string;
relevanceScore?: number;
metrics?: {
stars?: number;
forks?: number;
watchers?: number;
openIssues?: number;
repoSizeKb?: number;
estimatedDeliveryImpact?: number;
};
}>;
pdfBase64?: string;
pdfFileName?: string;
}

interface EditableResumeSection {
heading: string;
bullets: string[];
}

interface EditableResume {
title: string;
subtitle: string;
contactLine: string;
summary: string;
sections: EditableResumeSection[];
}

const toList = (value: unknown): string[] =>
Array.isArray(value)
? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
: [];

const escapeHtml = (value: string): string =>
value
.replace(/&/g, "&amp;")
.replace(/</g, "&lt;")
.replace(/>/g, "&gt;")
.replace(/"/g, "&quot;")
.replace(/'/g, "&#39;");

interface HeaderContactInfo {
email: string;
linkedin: string;
other: string;
}

const extractHeaderContactInfo = (contactLine: string): HeaderContactInfo => {
const raw = contactLine ?? "";
const email = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? "";
const linkedinMatch = raw.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/[\w\-./%]+/i)?.[0] ?? "";
const linkedin = linkedinMatch
? (linkedinMatch.startsWith("http") ? linkedinMatch : `https://${linkedinMatch}`)
: "";
const withoutEmail = email ? raw.replace(email, "") : raw;
const withoutLinkedin = linkedinMatch ? withoutEmail.replace(linkedinMatch, "") : withoutEmail;
const other = withoutLinkedin.replace(/[|,;]\s*[|,;]*/g, " | ").replace(/\s+/g, " ").trim().replace(/^\|\s*|\s*\|$/g, "");

return { email, linkedin, other };
};

const progressColor = (status: string): string => {
if (status === "completed") return "bg-emerald-600";
if (status === "failed") return "bg-red-600";
return "bg-amber-500";
};

const riskBadgeClass: Record<RiskLevel, string> = {
high: "bg-rose-100 text-rose-700 border-rose-200",
medium: "bg-amber-100 text-amber-700 border-amber-200",
low: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

export const ResultsPage = () => {
const { jobId = "" } = useParams();
const [data, setData] = useState<JobResponse | null>(null);
const [error, setError] = useState("");
const [editableResume, setEditableResume] = useState<EditableResume | null>(null);

useEffect(() => {
if (!jobId) return;

let active = true;
const poll = async () => {
try {
const response = await fetchJob(jobId);
if (!active) return;
setData(response);
setError("");
if (response.status === "completed" || response.status === "failed") {
return;
}
setTimeout(poll, 2000);
} catch (requestError) {
if (!active) return;
setError((requestError as Error).message || "Failed to fetch job status");
setTimeout(poll, 3000);
}
};

poll();
return () => {
active = false;
};
}, [jobId]);

const textResult = useMemo(() => (data?.result ? JSON.stringify(data.result, null, 2) : ""), [data]);


const atsResult = (data?.result ?? {}) as ResumeAnalysisResult;
const matchResult = (data?.result ?? {}) as JobMatchResult;
const generatedResult = (data?.result ?? {}) as ResumeGenerationResult;

const atsScore = Number(atsResult.atsScore ?? 0);
const matchScore = Number(matchResult.matchPercentage ?? 0);
const isAnalyze = data?.jobType === "resume-analysis";
const isMatch = data?.jobType === "job-matching";
const isGenerate = data?.jobType === "resume-generation";

const sectionRatings = Array.isArray(atsResult.sectionRatings)
? atsResult.sectionRatings.filter((row) => row && typeof row === "object")
: [];
const strictFittingProfiles = Array.isArray(atsResult.strictFittingProfiles)
? atsResult.strictFittingProfiles.filter((row) => row && typeof row === "object")
: [];
const goodPoints = toList(atsResult.goodPoints);
const grammarImprovements = Array.isArray(atsResult.grammarImprovements)
? atsResult.grammarImprovements.filter((row) => row && typeof row === "object")
: [];
const atsImprovements = Array.isArray(atsResult.atsImprovements)
? atsResult.atsImprovements.filter((row) => row && typeof row === "object")
: [];
const coreImprovements = Array.isArray(atsResult.coreImprovements)
? atsResult.coreImprovements.filter((row) => row && typeof row === "object")
: [];
const suggestions = toList(atsResult.suggestions);
const next7Days = toList(atsResult.next7Days);
const overallRisk = atsResult.overallRiskLevel ?? "medium";

const matchStrengths = toList(matchResult.matchedStrengths);
const missingSkills = toList(matchResult.missingSkills);
const matchSuggestions = toList(matchResult.suggestions);
const matchCategoryScores = Array.isArray(matchResult.categoryScores)
? matchResult.categoryScores.filter((row) => row && typeof row === "object")
: [];
const matchCriticalGaps = Array.isArray(matchResult.criticalGaps)
? matchResult.criticalGaps.filter((row) => row && typeof row === "object")
: [];
const domainAlignment = matchResult.domainAlignment;
const recommendation = matchResult.recommendation ?? (matchScore >= 72 ? "Strong fit" : matchScore >= 48 ? "Borderline fit" : "Weak fit");
const extractedRequirements = matchResult.extractedRequirements;
const extractedCoreSkills = toList(extractedRequirements?.coreSkills);
const extractedMustHaves = toList(extractedRequirements?.mustHaveRequirements);
const extractedResponsibilities = toList(extractedRequirements?.responsibilities);

const generatedSections = Array.isArray(generatedResult.sections)
? generatedResult.sections.filter((section) => section && typeof section === "object")
: [];
const githubProjectsUsed = Array.isArray(generatedResult.githubProjectsUsed)
? generatedResult.githubProjectsUsed.filter((project) => project && typeof project === "object")
: [];

const buildEditableResumeFromResult = (): EditableResume => ({
title: generatedResult.title?.trim() || "Tailored Resume",
subtitle: generatedResult.subtitle?.trim() || "",
contactLine: generatedResult.contactLine?.trim() || "",
summary: generatedResult.summary?.trim() || "",
sections: generatedSections.map((section) => ({
heading: (section.heading ?? "Section").trim(),
bullets: toList(section.bullets),
})),
});

const headerContactInfo = extractHeaderContactInfo(editableResume?.contactLine ?? "");

useEffect(() => {
if (!isGenerate || data?.status !== "completed") {
return;
}
setEditableResume((prev) => prev ?? buildEditableResumeFromResult());
}, [isGenerate, data?.status, data?.updatedAt]);

useEffect(() => {
setEditableResume(null);
}, [jobId]);

const setResumeField = (field: keyof Omit<EditableResume, "sections">, value: string) => {
setEditableResume((prev) => (prev ? { ...prev, [field]: value } : prev));
};

const setSectionHeading = (sectionIndex: number, heading: string) => {
setEditableResume((prev) => {
if (!prev) return prev;
const sections = prev.sections.map((section, index) => (index === sectionIndex ? { ...section, heading } : section));
return { ...prev, sections };
});
};

const setSectionBullet = (sectionIndex: number, bulletIndex: number, bullet: string) => {
setEditableResume((prev) => {
if (!prev) return prev;
const sections = prev.sections.map((section, index) => {
if (index !== sectionIndex) return section;
const bullets = section.bullets.map((item, itemIndex) => (itemIndex === bulletIndex ? bullet : item));
return { ...section, bullets };
});
return { ...prev, sections };
});
};

const addSection = () => {
setEditableResume((prev) => {
if (!prev) return prev;
return { ...prev, sections: [...prev.sections, { heading: "New Section", bullets: ["Add bullet"] }] };
});
};

const addBullet = (sectionIndex: number) => {
setEditableResume((prev) => {
if (!prev) return prev;
const sections = prev.sections.map((section, index) =>
index === sectionIndex ? { ...section, bullets: [...section.bullets, "New bullet"] } : section,
);
return { ...prev, sections };
});
};

const removeBullet = (sectionIndex: number, bulletIndex: number) => {
setEditableResume((prev) => {
if (!prev) return prev;
const sections = prev.sections.map((section, index) => {
if (index !== sectionIndex) return section;
const bullets = section.bullets.filter((_item, idx) => idx !== bulletIndex);
return { ...section, bullets: bullets.length ? bullets : ["Add bullet"] };
});
return { ...prev, sections };
});
};

const printEditableResumePdf = () => {
if (!editableResume) return;

const contactInfo = extractHeaderContactInfo(editableResume.contactLine);
const contactHtmlParts: string[] = [];
if (contactInfo.email) {
contactHtmlParts.push(`<a href="mailto:${escapeHtml(contactInfo.email)}">${escapeHtml(contactInfo.email)}</a>`);
}
if (contactInfo.linkedin) {
contactHtmlParts.push(`<a href="${escapeHtml(contactInfo.linkedin)}" target="_blank" rel="noreferrer">${escapeHtml(contactInfo.linkedin.replace(/^https?:\/\//, ""))}</a>`);
}
if (contactInfo.other) {
contactHtmlParts.push(`<span>${escapeHtml(contactInfo.other)}</span>`);
}
const contactHtml = contactHtmlParts.length ? `<p class="contact">${contactHtmlParts.join("<span class=\"sep\"> | </span>")}</p>` : "";

const renderedSections = editableResume.sections
.map((section) => {
const bullets = section.bullets
.map((bullet) => `<li>${escapeHtml(bullet)}</li>`)
.join("");
return `<section><h3>${escapeHtml(section.heading)}</h3><ul>${bullets}</ul></section>`;
})
.join("");

const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(editableResume.title)}</title>
<style>
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: Georgia, 'Times New Roman', serif; color: #0f172a; background: #dbeafe; }
.page {
width: 210mm;
min-height: 297mm;
margin: 0 auto;
padding: 0;
background: #ffffff;
box-shadow: 0 22px 56px -28px rgba(2, 6, 23, 0.45);
}
.hero {
background: linear-gradient(115deg, #0f172a 0%, #0b3b52 52%, #0f766e 100%);
color: #f8fafc;
padding: 12mm 12mm 8mm 12mm;
}
.header { display: flex; align-items: flex-start; justify-content: space-between; gap: 10mm; }
.name-wrap { max-width: 128mm; }
.name { font-size: 31px; font-weight: 700; margin: 0; letter-spacing: .2px; line-height: 1.06; }
.subtitle { margin: 4px 0 0; color: #d1fae5; font-size: 12.2px; font-weight: 700; font-family: 'Trebuchet MS', Arial, sans-serif; letter-spacing: .6px; }
.contact { margin: 0; font-size: 10.2px; line-height: 1.45; color: #e2e8f0; text-align: right; font-family: 'Trebuchet MS', Arial, sans-serif; max-width: 66mm; }
.contact a { color: #d1fae5; text-decoration: none; border-bottom: 1px dotted rgba(209, 250, 229, 0.65); }
.contact .sep { opacity: .8; }
.body { padding: 8mm 12mm 11mm 12mm; }
section { margin-top: 12px; }
h3 {
margin: 0 0 7px;
font-size: 10.6px;
letter-spacing: 1.9px;
color: #0f4f5f;
text-transform: uppercase;
font-family: 'Trebuchet MS', Arial, sans-serif;
border-bottom: 1px solid #bfdbfe;
padding-bottom: 5px;
}
p.summary { margin: 0; font-size: 11.35px; line-height: 1.6; color: #1f2937; }
ul { margin: 0; padding-left: 17px; }
li { margin: 0 0 5px; font-size: 11.15px; line-height: 1.48; color: #1f2937; }
li::marker { color: #0f766e; }
section, li { break-inside: avoid; page-break-inside: avoid; }

@page {
size: A4;
margin: 12mm;
}

@media print {
html, body { width: 210mm; }
body {
background: #ffffff;
-webkit-print-color-adjust: exact;
print-color-adjust: exact;
}
.page {
width: auto;
min-height: auto;
margin: 0;
padding: 0;
box-shadow: none;
}
}
</style>
</head>
<body>
<article class="page">
<div class="hero">
<header class="header">
<div class="name-wrap">
<h1 class="name">${escapeHtml(editableResume.title)}</h1>
${editableResume.subtitle ? `<p class="subtitle">${escapeHtml(editableResume.subtitle)}</p>` : ""}
 </div>
${contactHtml}
</header>
</div>
<div class="body">
${editableResume.summary ? `<section><h3>Professional Summary</h3><p class="summary">${escapeHtml(editableResume.summary)}</p></section>` : ""}
${renderedSections}
</div>
</article>
</body>
</html>`;

const win = window.open("", "_blank", "width=900,height=1100");
if (!win) return;
win.document.open();
win.document.write(html);
win.document.close();
win.onload = () => {
win.focus();
setTimeout(() => {
win.print();
}, 120);
};
};

return (
<div className="w-full px-4 py-8 md:px-8 xl:px-12">
<div className="mb-6 flex flex-wrap items-center justify-between gap-4">
<div>
<p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Career Intelligence</p>
<h1 className="mt-2 text-3xl font-semibold text-slate-900">Your Personalized Results</h1>
</div>
<Link
className="border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-400"
to="/"
>
Back to Upload
</Link>
</div>

<div className="border border-slate-200 bg-white p-6">
<div className="flex flex-wrap items-center justify-between gap-3">
<div>
<p className="text-sm text-slate-500">Job ID</p>
<p className="mt-1 break-all text-sm text-slate-700">{jobId}</p>
</div>
{data ? (
<span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-slate-700">
{data.jobType.replace("-", " ")}
</span>
) : null}
</div>
{data ? (
<>
<p className="mt-4 text-sm font-medium text-slate-700">Status: {data.status}</p>
<div className="mt-3 h-2 w-full overflow-hidden rounded bg-slate-100">
<div
className={`h-full ${progressColor(data.status)} transition-all`}
style={{
width:
data.status === "pending"
? "25%"
: data.status === "processing"
? "65%"
: "100%",
}}
/>
</div>
</>
) : (
<p className="mt-4 text-sm text-slate-600">Loading job status...</p>
)}
{error ? <p className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
</div>

{data?.status === "completed" ? (
<div className="mt-6 space-y-6">
{isAnalyze ? (
<>
<div className="grid gap-6 md:grid-cols-3">
<div className="rounded-3xl border border-teal-200 bg-gradient-to-br from-teal-50 to-emerald-50 p-6">
<p className="text-sm font-medium text-teal-800">ATS Score</p>
<p className="mt-2 text-5xl font-semibold text-teal-900">{atsScore}%</p>
<div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-teal-100">
<div className="h-full bg-teal-600" style={{ width: `${Math.max(0, Math.min(100, atsScore))}%` }} />
</div>
</div>
<div className="rounded-3xl border border-slate-200 bg-white p-6 md:col-span-2">
<div className="flex items-center justify-between gap-3">
<p className="text-sm font-semibold uppercase tracking-wider text-slate-500">Overall Analysis</p>
<span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase ${riskBadgeClass[overallRisk]}`}>
{overallRisk} risk
</span>
</div>
<p className="mt-3 text-lg text-slate-900">{atsResult.headline ?? "Analysis completed."}</p>
<p className="mt-3 text-sm leading-7 text-slate-700">{atsResult.fitSummary}</p>
</div>
</div>

<div className="grid gap-6 md:grid-cols-2">
<div className="rounded-3xl border border-slate-200 bg-white p-6">
<h3 className="text-lg font-semibold text-slate-900">Section Ratings</h3>
<div className="mt-4 space-y-3">
{sectionRatings.map((row) => {
const score = Math.max(0, Math.min(100, Number(row.score ?? 0)));
const risk = row.riskLevel ?? "medium";
return (
<div key={`${row.section}-${row.summary}`} className="rounded-xl border border-slate-200 p-3">
<div className="flex items-center justify-between gap-2">
<p className="font-medium text-slate-900">{row.section}</p>
<span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase ${riskBadgeClass[risk]}`}>
{risk}
</span>
</div>
<div className="mt-2 h-2 w-full overflow-hidden rounded bg-slate-100">
<div className="h-full bg-slate-700" style={{ width: `${score}%` }} />
</div>
<p className="mt-2 text-sm text-slate-700">{row.summary}</p>
</div>
);
})}
</div>
</div>

<div className="rounded-3xl border border-slate-200 bg-white p-6">
<h3 className="text-lg font-semibold text-slate-900">Strict Fitting Job Profiles</h3>
<div className="mt-4 space-y-3">
{strictFittingProfiles.map((profile) => (
<div key={`${profile.profile}-${profile.reason}`} className="rounded-xl bg-indigo-50 p-3">
<div className="flex items-center justify-between gap-2">
<p className="font-medium text-indigo-900">{profile.profile}</p>
<p className="text-sm font-semibold text-indigo-800">{Math.max(0, Math.min(100, Number(profile.fitPercentage ?? 0)))}%</p>
</div>
<p className="mt-1 text-sm text-indigo-900/80">{profile.reason}</p>
</div>
))}
</div>
</div>
</div>

<div className="grid gap-6 md:grid-cols-3">
<div className="rounded-3xl border border-slate-200 bg-white p-6 md:col-span-1">
<h3 className="text-lg font-semibold text-slate-900">Good Points</h3>
<ul className="mt-4 space-y-2 text-sm text-slate-700">
{goodPoints.map((point) => (
<li key={point} className="rounded-lg bg-emerald-50 px-3 py-2">
{point}
</li>
))}
</ul>
</div>

<div className="rounded-3xl border border-slate-200 bg-white p-6 md:col-span-1">
<h3 className="text-lg font-semibold text-slate-900">Grammar Improvements</h3>
<div className="mt-4 space-y-3">
{grammarImprovements.map((item) => {
const risk = item.riskLevel ?? "medium";
return (
<div key={`${item.issue}-${item.example}`} className="rounded-xl border border-slate-200 p-3">
<div className="flex items-center justify-between gap-2">
<p className="font-medium text-slate-900">{item.issue}</p>
<span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase ${riskBadgeClass[risk]}`}>
{risk}
</span>
</div>
<p className="mt-2 text-sm text-slate-700">{item.suggestion}</p>
<p className="mt-2 rounded bg-slate-100 p-2 text-xs text-slate-700">{item.example}</p>
</div>
);
})}
</div>
</div>

<div className="rounded-3xl border border-slate-200 bg-white p-6 md:col-span-1">
<h3 className="text-lg font-semibold text-slate-900">ATS Improvements</h3>
<div className="mt-4 space-y-3">
{atsImprovements.map((item) => {
const risk = item.riskLevel ?? "medium";
return (
<div key={`${item.issue}-${item.fix}`} className="rounded-xl border border-slate-200 p-3">
<div className="flex items-center justify-between gap-2">
<p className="font-medium text-slate-900">{item.issue}</p>
<span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase ${riskBadgeClass[risk]}`}>
{risk}
</span>
</div>
<p className="mt-2 text-sm text-slate-700">Impact: {item.impact}</p>
<p className="mt-2 rounded bg-slate-100 p-2 text-xs text-slate-700">Fix: {item.fix}</p>
</div>
);
})}
</div>
</div>
</div>

<div className="rounded-3xl border border-slate-200 bg-white p-6">
<h3 className="text-lg font-semibold text-slate-900">Core Improvements</h3>
<div className="mt-4 grid gap-3 md:grid-cols-2">
{coreImprovements.map((item) => {
const risk = item.riskLevel ?? "medium";
return (
<div key={`${item.area}-${item.expectedOutcome}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
<div className="flex items-center justify-between gap-2">
<h4 className="font-semibold text-slate-900">{item.area}</h4>
<span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase ${riskBadgeClass[risk]}`}>
{risk}
</span>
</div>
<ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
{toList(item.actions).map((action) => (
<li key={action}>{action}</li>
))}
</ul>
<p className="mt-2 text-sm text-slate-700">Outcome: {item.expectedOutcome}</p>
</div>
);
})}
</div>
</div>

<div className="rounded-3xl border border-slate-200 bg-white p-6">
<h3 className="text-lg font-semibold text-slate-900">Action Plan</h3>
<ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-slate-700">
{next7Days.map((step) => (
<li key={step}>{step}</li>
))}
</ol>
<div className="mt-4 border-t border-slate-200 pt-4">
<h4 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Suggestions</h4>
<ul className="mt-3 grid gap-2 text-sm text-slate-700 md:grid-cols-2">
{suggestions.map((item) => (
<li key={item} className="rounded-lg bg-slate-100 px-3 py-2">
{item}
</li>
))}
</ul>
</div>
</div>
</>
) : null}

{isMatch ? (
<div className="space-y-6">
<div className="grid gap-6 md:grid-cols-3">
<div className="rounded-3xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-cyan-50 p-6">
<p className="text-sm font-medium text-indigo-800">Match Score</p>
<p className="mt-2 text-5xl font-semibold text-indigo-900">{matchScore}%</p>
<p className="mt-2 text-sm font-medium text-indigo-900">{recommendation}</p>
</div>
<div className="rounded-3xl border border-slate-200 bg-white p-6 md:col-span-2">
<h3 className="text-lg font-semibold text-slate-900">Fit Summary</h3>
<p className="mt-3 text-sm leading-7 text-slate-700">{matchResult.headline ?? matchResult.fitSummary}</p>
<p className="mt-3 text-sm leading-7 text-slate-700">{matchResult.fitSummary}</p>
</div>
</div>

<div className="rounded-3xl border border-slate-200 bg-white p-6">
<h3 className="text-lg font-semibold text-slate-900">Domain Alignment</h3>
<div className="mt-3 grid gap-4 md:grid-cols-3">
<div className="rounded-xl bg-slate-50 p-3">
<p className="text-xs uppercase tracking-wider text-slate-500">Resume Domain</p>
<p className="mt-1 font-medium text-slate-900">{domainAlignment?.resumeDomain ?? "Unknown"}</p>
</div>
<div className="rounded-xl bg-slate-50 p-3">
<p className="text-xs uppercase tracking-wider text-slate-500">Job Domain</p>
<p className="mt-1 font-medium text-slate-900">{domainAlignment?.jobDomain ?? "Unknown"}</p>
</div>
<div className="rounded-xl bg-slate-50 p-3">
<p className="text-xs uppercase tracking-wider text-slate-500">Alignment Confidence</p>
<p className="mt-1 font-medium text-slate-900">{Math.max(0, Math.min(100, Number(domainAlignment?.confidence ?? 0)))}%</p>
</div>
</div>
<p className="mt-3 text-sm text-slate-700">{domainAlignment?.rationale}</p>
</div>

<div className="rounded-3xl border border-slate-200 bg-white p-6">
<div className="flex items-center justify-between gap-3">
<h3 className="text-lg font-semibold text-slate-900">Extracted Job Requirements</h3>
<span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-slate-700">
{extractedRequirements?.roleTitle ?? "Role"}
</span>
</div>
<p className="mt-2 text-sm text-slate-600">Domain: {extractedRequirements?.jobDomain ?? domainAlignment?.jobDomain ?? "Unknown"}</p>
<div className="mt-4 grid gap-4 md:grid-cols-3">
<div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
<p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Core Skills</p>
<ul className="mt-2 space-y-1 text-sm text-slate-700">
{extractedCoreSkills.map((item) => (
<li key={item}>{item}</li>
))}
</ul>
</div>
<div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
<p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Must-Haves</p>
<ul className="mt-2 space-y-1 text-sm text-slate-700">
{extractedMustHaves.map((item) => (
<li key={item}>{item}</li>
))}
</ul>
</div>
<div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
<p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Responsibilities</p>
<ul className="mt-2 space-y-1 text-sm text-slate-700">
{extractedResponsibilities.map((item) => (
<li key={item}>{item}</li>
))}
</ul>
</div>
</div>
</div>

<div className="rounded-3xl border border-slate-200 bg-white p-6">
<h3 className="text-lg font-semibold text-slate-900">Match Breakdown</h3>
<div className="mt-4 space-y-3">
{matchCategoryScores.map((item) => {
const score = Math.max(0, Math.min(100, Number(item.score ?? 0)));
return (
<div key={`${item.category}-${item.evidence}`} className="rounded-xl border border-slate-200 p-3">
<div className="flex items-center justify-between gap-2">
<p className="font-medium text-slate-900">{item.category}</p>
<p className="text-sm font-semibold text-slate-700">{score}%</p>
</div>
<div className="mt-2 h-2 w-full overflow-hidden rounded bg-slate-100">
<div className="h-full bg-indigo-600" style={{ width: `${score}%` }} />
</div>
<p className="mt-2 text-sm text-slate-700">{item.evidence}</p>
</div>
);
})}
</div>
</div>

<div className="grid gap-6 md:grid-cols-2">
<div className="rounded-3xl border border-slate-200 bg-white p-6">
<h3 className="text-lg font-semibold text-slate-900">Matched Strengths</h3>
<ul className="mt-4 space-y-2 text-sm text-slate-700">
{matchStrengths.map((item) => (
<li key={item} className="rounded-lg bg-emerald-50 px-3 py-2">
{item}
</li>
))}
</ul>
</div>
<div className="rounded-3xl border border-slate-200 bg-white p-6">
<h3 className="text-lg font-semibold text-slate-900">Missing Skills / Signals</h3>
<ul className="mt-4 flex flex-wrap gap-2 text-sm">
{missingSkills.map((item) => (
<li key={item} className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-rose-700">
{item}
</li>
))}
</ul>
</div>
</div>

<div className="rounded-3xl border border-slate-200 bg-white p-6">
<h3 className="text-lg font-semibold text-slate-900">Critical Gaps</h3>
<div className="mt-4 space-y-3">
{matchCriticalGaps.map((item) => {
const severity = item.severity ?? "medium";
return (
<div key={`${item.gap}-${item.whyItMatters}`} className="rounded-xl border border-slate-200 p-3">
<div className="flex items-center justify-between gap-2">
<p className="font-medium text-slate-900">{item.gap}</p>
<span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase ${riskBadgeClass[severity]}`}>{severity}</span>
</div>
<p className="mt-2 text-sm text-slate-700">{item.whyItMatters}</p>
</div>
);
})}
</div>
</div>

<div className="rounded-3xl border border-slate-200 bg-white p-6">
<h3 className="text-lg font-semibold text-slate-900">How To Improve Match Fast</h3>
<ul className="mt-4 grid gap-3 text-sm text-slate-700 md:grid-cols-2">
{matchSuggestions.map((item) => (
<li key={item} className="rounded-xl bg-slate-100 px-3 py-2">
{item}
</li>
))}
</ul>
</div>
</div>
) : null}

{isGenerate ? (
<section className="space-y-5">
<div className="border-b border-slate-200 pb-3">
<div className="flex flex-wrap items-center justify-between gap-3">
<h2 className="text-2xl font-semibold text-slate-900">Resume Studio</h2>
<div className="flex flex-wrap items-center gap-3">
<span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
{generatedResult.isTechJob ? "Tech Role" : "General Role"}
</span>
{generatedResult.githubUsername ? <span className="text-xs text-slate-600">GitHub @{generatedResult.githubUsername}</span> : null}
<button
type="button"
onClick={printEditableResumePdf}
className="bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
>
Export A4 PDF
</button>
</div>
</div>
</div>

{editableResume ? (
<div className="grid gap-0 border border-slate-300 bg-white xl:grid-cols-[42%_58%]">
<div className="max-h-[calc(100vh-230px)] overflow-auto border-r border-slate-300 bg-slate-50 p-5">
<p className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Edit Resume Content</p>
<div className="space-y-4">
<label className="block text-sm font-medium text-slate-700">
Resume Title
<input
value={editableResume.title}
onChange={(event) => setResumeField("title", event.target.value)}
className="mt-1 w-full border border-slate-300 bg-white px-3 py-2 text-sm"
/>
</label>
<label className="block text-sm font-medium text-slate-700">
Subtitle
<input
value={editableResume.subtitle}
onChange={(event) => setResumeField("subtitle", event.target.value)}
className="mt-1 w-full border border-slate-300 bg-white px-3 py-2 text-sm"
/>
</label>
<label className="block text-sm font-medium text-slate-700">
Contact Line
<input
value={editableResume.contactLine}
onChange={(event) => setResumeField("contactLine", event.target.value)}
className="mt-1 w-full border border-slate-300 bg-white px-3 py-2 text-sm"
placeholder="Email | LinkedIn | Phone | Location"
/>
</label>
<label className="block text-sm font-medium text-slate-700">
Summary
<textarea
rows={4}
value={editableResume.summary}
onChange={(event) => setResumeField("summary", event.target.value)}
className="mt-1 w-full border border-slate-300 bg-white px-3 py-2 text-sm"
/>
</label>

<div className="space-y-3">
{editableResume.sections.map((section, sectionIndex) => (
<div key={`${section.heading}-${sectionIndex}`} className="border border-slate-300 bg-white p-3">
<div className="mb-2 flex items-center gap-2">
<input
value={section.heading}
onChange={(event) => setSectionHeading(sectionIndex, event.target.value)}
className="w-full border border-slate-300 px-2 py-1.5 text-sm font-semibold"
/>
<button
type="button"
onClick={() => addBullet(sectionIndex)}
className="border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-700"
>
Add
</button>
</div>
<div className="space-y-2">
{section.bullets.map((bullet, bulletIndex) => (
<div key={`${sectionIndex}-${bulletIndex}`} className="flex items-start gap-2">
<textarea
rows={2}
value={bullet}
onChange={(event) => setSectionBullet(sectionIndex, bulletIndex, event.target.value)}
className="w-full border border-slate-300 bg-white px-2 py-1.5 text-sm"
/>
<button
type="button"
onClick={() => removeBullet(sectionIndex, bulletIndex)}
className="border border-rose-300 bg-rose-50 px-2 py-1.5 text-xs font-medium text-rose-700"
>
Delete
</button>
</div>
))}
</div>
</div>
))}
</div>

<button
type="button"
onClick={addSection}
className="border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700"
>
Add Section
</button>
{githubProjectsUsed.length ? (
<div className="border-t border-slate-300 pt-4">
<p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">GitHub Projects Used</p>
<ul className="mt-2 space-y-1 text-sm text-slate-700">
{githubProjectsUsed.map((project) => (
<li key={`${project.name}-${project.url}`}>{project.name}</li>
))}
</ul>
</div>
) : null}
</div>
</div>

<div className="max-h-[calc(100vh-230px)] overflow-auto bg-[#dbeafe] p-4">
<div className="mx-auto w-[210mm] min-h-[297mm] overflow-hidden bg-white shadow-[0_24px_58px_-28px_rgba(2,6,23,0.45)]">
<header className="bg-gradient-to-r from-slate-950 via-cyan-900 to-teal-700 px-10 pb-7 pt-10 text-white">
<div className="flex items-start justify-between gap-8">
<div className="max-w-[70%]">
<h2 className="font-serif text-4xl font-bold leading-tight tracking-tight">{editableResume.title}</h2>
{editableResume.subtitle ? <p className="mt-2 font-sans text-xs font-semibold uppercase tracking-[0.14em] text-emerald-100">{editableResume.subtitle}</p> : null}
</div>
{headerContactInfo.email || headerContactInfo.linkedin || headerContactInfo.other ? (
<div className="max-w-[34%] text-right font-sans text-[11px] leading-5 text-slate-100">
{headerContactInfo.email ? (
<div>
<a href={`mailto:${headerContactInfo.email}`} className="border-b border-emerald-100/60 text-emerald-100 hover:text-white">
{headerContactInfo.email}
</a>
</div>
) : null}
{headerContactInfo.linkedin ? (
<div>
<a href={headerContactInfo.linkedin} target="_blank" rel="noreferrer" className="border-b border-emerald-100/60 text-emerald-100 hover:text-white">
{headerContactInfo.linkedin.replace(/^https?:\/\//, "")}
</a>
</div>
) : null}
{headerContactInfo.other ? <div className="text-slate-200">{headerContactInfo.other}</div> : null}
</div>
) : null}
</div>
</header>
<div className="px-10 pb-10 pt-7">
{editableResume.summary ? (
<section>
<p className="border-b border-blue-200 pb-1 font-sans text-[11px] font-bold uppercase tracking-[0.18em] text-teal-800">Professional Summary</p>
<p className="mt-2 font-serif text-[14px] leading-7 text-slate-700">{editableResume.summary}</p>
</section>
) : null}
<div className="mt-4 space-y-4">
{editableResume.sections.map((section, sectionIndex) => (
<section key={`${section.heading}-preview-${sectionIndex}`}>
<h3 className="border-b border-blue-200 pb-1 font-sans text-[11px] font-bold uppercase tracking-[0.18em] text-teal-800">{section.heading}</h3>
<ul className="mt-2 list-disc space-y-1 pl-5 font-serif text-[14px] leading-7 text-slate-700 marker:text-teal-700">
{section.bullets.map((bullet, bulletIndex) => (
<li key={`${sectionIndex}-preview-bullet-${bulletIndex}`}>{bullet}</li>
))}
</ul>
</section>
))}
</div>
</div>
</div>
</div>
</div>
) : null}

<details className="border border-slate-300 bg-white p-3">
<summary className="cursor-pointer text-sm font-medium text-slate-700">Generated Data</summary>
<pre className="mt-2 max-h-[260px] overflow-auto bg-slate-900 p-3 text-xs text-slate-100">
{editableResume ? JSON.stringify(editableResume, null, 2) : generatedResult.plainTextResume ?? textResult}
</pre>
</details>
</section>
) : null}

<details className="border border-slate-200 bg-white p-4">
<summary className="cursor-pointer text-sm font-medium text-slate-700">Show Raw JSON (debug)</summary>
<pre className="mt-3 max-h-[320px] overflow-auto rounded-xl bg-slate-900 p-4 text-xs text-slate-100">
{textResult}
</pre>
</details>
</div>
) : null}
</div>
);
};
