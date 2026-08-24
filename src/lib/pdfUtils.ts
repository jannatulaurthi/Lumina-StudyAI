import * as pdfjsLib from 'pdfjs-dist';

// Set the worker source to a reliable CDN link that matches the package version
// Using jsDelivr for better connectivity across different environments
const PDFJS_VERSION = '5.7.284';
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;

export const extractTextFromPdf = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items
      .map((item: any) => (item.str !== undefined ? item.str : ''))
      .filter((str: string) => str.trim() !== '');
    fullText += strings.join(' ') + '\n';
  }

  return fullText;
};
