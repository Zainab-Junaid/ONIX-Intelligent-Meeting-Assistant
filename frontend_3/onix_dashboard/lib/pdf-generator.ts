import { marked } from 'marked';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Helper to strip markdown and non-ASCII symbols for clean PDF output (jsPDF default font is ASCII-only)
function cleanMarkdownText(text: string): string {
  if (!text) return '';
  return text
    .replace(/^#+\s*/gm, '') // strip leading ### from headings
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/__/g, '')
    .replace(/_/g, '')
    .replace(/`/g, '')
    .replace(/\u2022/g, '-') // Unicode bullet -> ASCII hyphen
    .trim();
}

export interface ActionItem {
  item: string;
  assignedTo?: string;
  dueDate?: string;
}

export interface PDFData {
  meetingTitle: string;
  meetingId: string;
  dateStr: string;
  summaryText: string;
  actionItems: ActionItem[];
}

/**
 * Generates a "Meeting Insights" PDF with summary and action items.
 * Returns the PDF as a Base64 string.
 */
export async function generateMeetingPDF(data: PDFData): Promise<string> {
  const { meetingTitle, meetingId, dateStr, summaryText, actionItems } = data;
  
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Header
  // Using a professional blue color #4c51bf (consistent with frontend_2)
  doc.setFillColor(76, 81, 191); 
  doc.rect(0, 0, pageWidth, 40, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.text('Meeting Insights', 20, 20);
  doc.setFontSize(10);
  doc.text(`Meeting Id: ${meetingId}`, 20, 30);
  doc.text(`Generated on ${new Date().toLocaleDateString()}`, pageWidth - 20, 30, { align: 'right' });

  let yPos = 55;

  // Meeting Title
  doc.setTextColor(26, 32, 44);
  doc.setFontSize(20);
  doc.text(meetingTitle, 20, yPos);
  yPos += 10;
  
  // Meeting Date
  doc.setFontSize(10);
  doc.setTextColor(113, 128, 150);
  doc.text(`Meeting Date: ${dateStr}`, 20, yPos);
  yPos += 15;

  // Summary Section
  doc.setTextColor(26, 32, 44);
  doc.setFontSize(16);
  doc.text('Summary', 20, yPos);
  yPos += 8;
  
  // Parse summary with marked lexer
  const tokens = marked.lexer(summaryText);
  
  doc.setTextColor(45, 55, 72);
  
  tokens.forEach(token => {
      // Check for page break
      if (yPos > 270) {
          doc.addPage();
          yPos = 20;
      }

      const anyToken = token as any; // marked types are sometimes strict

      if (token.type === 'heading') {
          doc.setFontSize(14 - (token.depth)); // H1=13, H2=12, etc
          doc.setFont(undefined as any, 'bold');
          yPos += 5;
          const headingText = cleanMarkdownText(anyToken.text ?? anyToken.raw ?? '');
          if (headingText) {
            doc.text(headingText, 20, yPos);
            yPos += 8;
          }
          doc.setFont(undefined as any, 'normal');
      } else if (token.type === 'paragraph') {
          doc.setFontSize(11);
          const cleanText = cleanMarkdownText(anyToken.text || '');
          const splitText = doc.splitTextToSize(cleanText, pageWidth - 40);
          doc.text(splitText, 20, yPos);
          yPos += (splitText.length * 6) + 4;
      } else if (token.type === 'list') {
          doc.setFontSize(11);
          token.items.forEach((item: any) => {
              if (yPos > 270) {
                  doc.addPage();
                  yPos = 20;
              }
              const cleanText = cleanMarkdownText(item.text || '');
              const splitText = doc.splitTextToSize('- ' + cleanText, pageWidth - 45);
              doc.text(splitText, 25, yPos); // Indent list items (use ASCII hyphen, not Unicode bullet)
              yPos += (splitText.length * 6) + 2;
          });
          yPos += 4;
      } else if (token.type === 'html') {
          // Handle HTML blocks (like <div align="center">...</div>)
          doc.setFontSize(11);
          const rawText = token.text || anyToken.raw || '';
          
          let align: 'left' | 'center' | 'right' = 'left';
          if (rawText.match(/align=["']center["']/i)) align = 'center';
          else if (rawText.match(/align=["']right["']/i)) align = 'right';

          const cleanText = cleanMarkdownText(rawText);
          if (cleanText) {
             const splitText = doc.splitTextToSize(cleanText, pageWidth - 40);
             const xPos = align === 'center' ? pageWidth / 2 : (align === 'right' ? pageWidth - 20 : 20);
             doc.text(splitText, xPos, yPos, { align: align });
             yPos += (splitText.length * 6) + 4;
          }
      }
  });

  yPos += 10;

  // Action Items Section
  if (actionItems && actionItems.length > 0) {
    if (yPos > 240) {
      doc.addPage();
      yPos = 20;
    }
    
    doc.setTextColor(26, 32, 44);
    doc.setFontSize(16);
    doc.text('Action Items', 20, yPos);
    yPos += 5;

    autoTable(doc, {
      startY: yPos,
      head: [['Task', 'Assigned To', 'Due Date']],
      body: actionItems.map(item => [
        item.item, 
        item.assignedTo || '-', 
        item.dueDate || '-'
      ]),
      theme: 'striped',
      headStyles: { fillColor: [76, 81, 191] },
      margin: { left: 20, right: 20 }
    });
  }

  // Footer on all pages
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(160, 174, 192);
    doc.text(
      'Automatically generated by ONIX Meeting Assistant',
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'center' }
    );
  }

  const pdfArrayBuffer = doc.output('arraybuffer');
  return Buffer.from(pdfArrayBuffer).toString('base64');
}
