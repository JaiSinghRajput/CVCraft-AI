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
summary?: string;
sections?: Array<{ heading?: string; bullets?: string[] }>;
plainTextResume?: string;
}

const toList = (value: unknown): string[] =>
Array.isArray(value)
? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
: [];

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

const copyResult = async () => {
if (!textResult) return;
await navigator.clipboard.writeText(textResult);
};

const downloadResult = () => {
if (!textResult) return;
const blob = new Blob([textResult], { type: "text/plain;charset=utf-8" });
const url = URL.createObjectURL(blob);
const link = document.createElement("a");
link.href = url;
link.download = `ai-career-result-${jobId}.txt`;
document.body.appendChild(link);
link.click();
link.remove();
URL.revokeObjectURL(url);
};

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

return (
<div className="mx-auto max-w-6xl px-4 py-10">
<div className="mb-6 flex flex-wrap items-center justify-between gap-4">
<div>
<p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Career Intelligence</p>
<h1 className="mt-2 text-3xl font-semibold text-slate-900">Your Personalized Results</h1>
</div>
<Link
className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-400"
to="/"
>
Back to Upload
</Link>
</div>

<div className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-[0_25px_60px_-35px_rgba(15,23,42,0.35)] backdrop-blur">
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
<div className="space-y-6">
<div className="rounded-3xl border border-slate-200 bg-white p-6">
<h2 className="text-2xl font-semibold text-slate-900">{generatedResult.title ?? "Tailored Resume"}</h2>
<p className="mt-3 text-sm leading-7 text-slate-700">{generatedResult.summary}</p>
</div>

<div className="grid gap-4 md:grid-cols-2">
{generatedSections.map((section) => (
<div
key={`${section.heading}-${(section.bullets ?? []).join("|")}`}
className="rounded-2xl border border-slate-200 bg-white p-5"
>
<h3 className="text-lg font-semibold text-slate-900">{section.heading}</h3>
<ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700">
{toList(section.bullets).map((bullet) => (
<li key={bullet}>{bullet}</li>
))}
</ul>
</div>
))}
</div>

<div className="rounded-3xl border border-slate-200 bg-white p-6">
<div className="mb-4 flex flex-wrap gap-3">
<button
onClick={copyResult}
className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
>
Copy Structured Result
</button>
<button
onClick={downloadResult}
className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
>
Download .txt
</button>
</div>
<pre className="max-h-[360px] overflow-auto rounded-xl bg-slate-900 p-4 text-xs text-slate-100">
{generatedResult.plainTextResume ?? textResult}
</pre>
</div>
</div>
) : null}

<details className="rounded-2xl border border-slate-200 bg-white p-4">
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
