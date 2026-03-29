import { requestStructuredJson } from "../lib/openai";
import { sanitizeUserInput } from "../lib/prompt-guard";

export interface ResumeGenerationResult {
	title: string;
	summary: string;
	sections: Array<{ heading: string; bullets: string[] }>;
	plainTextResume: string;
}

export const generateTailoredResume = async (
	linkedinText: string,
	jobDescription: string,
): Promise<ResumeGenerationResult> => {
	const safeLinkedIn = sanitizeUserInput(linkedinText);
	const safeJobDescription = sanitizeUserInput(jobDescription);

	const fallback: ResumeGenerationResult = {
		title: "Tailored Resume",
		summary: "Results-focused professional with experience aligned to target role.",
		sections: [
			{
				heading: "Experience Highlights",
				bullets: [
					"Delivered measurable outcomes by improving process efficiency by 20%.",
					"Collaborated across teams to ship features supporting business goals.",
				],
			},
		],
		plainTextResume:
			"TAILORED RESUME\n\nSUMMARY\nResults-focused professional with experience aligned to target role.\n\nEXPERIENCE HIGHLIGHTS\n- Delivered measurable outcomes by improving process efficiency by 20%.\n- Collaborated across teams to ship features supporting business goals.",
	};

	const prompt = `Create a one-page ATS-friendly resume tailored to the job description from the LinkedIn profile text.
Return JSON keys: title (string), summary (string), sections (array of {heading:string, bullets:string[]}), plainTextResume (string).
Keep bullet points concise and quantified where possible.
LinkedIn:
${safeLinkedIn}

Job Description:
${safeJobDescription}`;
	return requestStructuredJson<ResumeGenerationResult>(prompt, fallback);
};
