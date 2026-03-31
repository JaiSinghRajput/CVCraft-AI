import PDFDocument from "pdfkit";

export interface PdfResumeSection {
	heading: string;
	bullets: string[];
}

export interface PdfResumeInput {
	title: string;
	subtitle?: string;
	contactLine?: string;
	summary: string;
	sections: PdfResumeSection[];
}

const safeText = (value: string | undefined): string => (value ?? "").trim();

export const renderResumePdf = async (resume: PdfResumeInput): Promise<Buffer> =>
	new Promise<Buffer>((resolve, reject) => {
		const doc = new PDFDocument({
			size: "A4",
			margins: { top: 44, left: 44, right: 44, bottom: 44 },
		});
		const chunks: Buffer[] = [];
		const pageWidth = doc.page.width;
		const left = doc.page.margins.left;
		const right = pageWidth - doc.page.margins.right;

		doc.on("data", (chunk: Buffer) => chunks.push(chunk));
		doc.on("end", () => resolve(Buffer.concat(chunks)));
		doc.on("error", reject);

		doc.rect(0, 0, pageWidth, 88).fill("#ecfeff");
		doc.fillColor("#0f172a");

		doc.font("Helvetica-Bold").fontSize(22).fillColor("#0f172a").text(safeText(resume.title) || "Tailored Resume", left, 28, {
			align: "left",
		});

		const subtitle = safeText(resume.subtitle);
		if (subtitle) {
			doc.font("Helvetica").fontSize(10.5).fillColor("#0f766e").text(subtitle, left, 54, {
				align: "left",
			});
		}

		const contactLine = safeText(resume.contactLine);
		if (contactLine) {
			doc.font("Helvetica").fontSize(9).fillColor("#334155").text(contactLine, left, 68, {
				width: right - left,
				align: "left",
			});
		}

		doc.moveDown(3.2);
		doc.moveTo(left, doc.y).lineTo(right, doc.y).lineWidth(1).strokeColor("#cbd5e1").stroke();
		doc.moveDown(0.8);

		const summary = safeText(resume.summary);
		if (summary) {
			doc.font("Helvetica-Bold").fontSize(10).fillColor("#0f766e").text("PROFESSIONAL SUMMARY", {
				characterSpacing: 1.4,
			});
			doc.moveDown(0.25);
			doc.font("Helvetica").fontSize(10.5).fillColor("#1f2937").text(summary, {
				lineGap: 2,
			});
			doc.moveDown(0.8);
		}

		for (const section of resume.sections) {
			const heading = safeText(section.heading);
			if (!heading || heading.toLowerCase() === "professional summary") {
				continue;
			}

			doc.font("Helvetica-Bold").fontSize(10).fillColor("#0f766e").text(heading.toUpperCase(), {
				characterSpacing: 1.2,
			});
			doc.moveTo(left, doc.y + 2).lineTo(right, doc.y + 2).lineWidth(0.6).strokeColor("#e2e8f0").stroke();
			doc.moveDown(0.25);

			const bullets = Array.isArray(section.bullets) ? section.bullets : [];
			for (const bullet of bullets) {
				const text = safeText(bullet);
				if (!text) {
					continue;
				}
				doc.font("Helvetica").fontSize(10.25).fillColor("#1f2937").text(`- ${text}`, {
					lineGap: 2,
					indent: 10,
				});
			}
			doc.moveDown(0.65);
		}

		doc.end();
	});
