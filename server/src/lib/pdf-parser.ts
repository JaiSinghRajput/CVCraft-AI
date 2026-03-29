import { PDFParse } from "pdf-parse";

export const extractPdfText = async (buffer: Buffer): Promise<string> => {
	const parser = new PDFParse({ data: buffer });
	try {
		const parsed = await parser.getText();
		return normalizeText(parsed.text ?? "");
	} finally {
		await parser.destroy();
	}
};

export const normalizeText = (input: string): string =>
	input
		.replace(/\u0000/g, " ")
		.replace(/\r/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.replace(/[ \t]{2,}/g, " ")
		.trim();
