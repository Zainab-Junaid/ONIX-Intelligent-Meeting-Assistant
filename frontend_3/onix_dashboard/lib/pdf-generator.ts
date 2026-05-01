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
    .replace(/[\u2018\u2019]/g, "'") // smart single quotes
    .replace(/[\u201C\u201D]/g, '"') // smart double quotes
    .replace(/[\u2013\u2014]/g, '-') // en and em dashes
    .replace(/[\u2026]/g, '...')     // ellipsis
    .replace(/[^\x00-\xFF]/g, '')    // strip all remaining non-Latin1 characters (like emojis)
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
  // Using the dashboard's primary blue color (bg-blue-600 => #2563eb)
  doc.setFillColor(37, 99, 235); 
  doc.rect(0, 0, pageWidth, 30, 'F');
  doc.setTextColor(255, 255, 255);
  
  // Meeting Title in Header (Left Aligned)
  doc.setFontSize(18);
  const cleanTitle = cleanMarkdownText(meetingTitle);
  const displayTitle = cleanTitle.length > 55 ? cleanTitle.substring(0, 55) + '...' : cleanTitle;
  doc.text(displayTitle, 20, 20);
  
  // Date in Header (Right Aligned)
  doc.setFontSize(10);
  doc.text(cleanMarkdownText(dateStr), pageWidth - 20, 20, { align: 'right' });

  let yPos = 45;

  // Meeting Insights Section Header
  doc.setTextColor(26, 32, 44);
  doc.setFontSize(18);
  doc.setFont(undefined as any, 'bold');
  doc.text('Meeting Insights', pageWidth / 2, yPos, { align: 'center' });
  doc.setFont(undefined as any, 'normal');
  yPos += 10;
  
  // Parse summary with marked lexer
  const tokens = marked.lexer(summaryText);
  
  doc.setTextColor(45, 55, 72);
  
  let seenKeyTopics = false;
  let seenListAfterKeyTopics = false;
  let summaryHeadingAdded = false;

  tokens.forEach(token => {
      // Check for page break
      if (yPos > 270) {
          doc.addPage();
          yPos = 20;
      }

      const anyToken = token as any; // marked types are sometimes strict

      if (token.type === 'heading') {
          const headingText = cleanMarkdownText(anyToken.text ?? anyToken.raw ?? '');
          
          if (headingText.toLowerCase().includes('key topic')) {
              seenKeyTopics = true;
          }

          // Skip drawing "Meeting Analysis" or "Summary" if the LLM generated them
          if (headingText.toLowerCase() === 'meeting analysis' || headingText.toLowerCase() === 'summary') {
              return;
          }
          
          doc.setFontSize(14 - (token.depth)); // H1=13, H2=12, etc
          doc.setFont(undefined as any, 'bold');
          yPos += 5;
          if (headingText) {
            doc.text(headingText, 20, yPos);
            yPos += 8;
          }
          doc.setFont(undefined as any, 'normal');
      } else if (token.type === 'paragraph') {
          if (seenListAfterKeyTopics && !summaryHeadingAdded) {
             doc.setFontSize(14);
             doc.setFont(undefined as any, 'bold');
             yPos += 5;
             doc.text('Summary', 20, yPos);
             yPos += 8;
             doc.setFont(undefined as any, 'normal');
             summaryHeadingAdded = true;
             doc.setTextColor(45, 55, 72); // Reset text color to default
          }

          doc.setFontSize(11);
          const cleanText = cleanMarkdownText(anyToken.text || '');
          const splitText = doc.splitTextToSize(cleanText, pageWidth - 40);
          doc.text(splitText, 20, yPos);
          yPos += (splitText.length * 6) + 4;
      } else if (token.type === 'list') {
          if (seenKeyTopics) {
              seenListAfterKeyTopics = true;
          }
          
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
    
    // Header for Action Items
    doc.setFontSize(14);
    doc.setFont(undefined as any, 'bold');
    doc.setTextColor(26, 32, 44);
    doc.text('Action Items', 20, yPos);
    yPos += 8;
    
    doc.setFont(undefined as any, 'normal');
    doc.setTextColor(45, 55, 72);
    doc.setFontSize(11);

    actionItems.forEach(item => {
        if (yPos > 270) {
            doc.addPage();
            yPos = 20;
        }
        const anyItem = item as any;
        const text = typeof anyItem === 'string' ? anyItem : (anyItem.text || anyItem.item || '');
        const cleanText = cleanMarkdownText(text);
        const splitText = doc.splitTextToSize('- ' + cleanText, pageWidth - 45);
        doc.text(splitText, 25, yPos); // Indent list items
        yPos += (splitText.length * 6) + 2;
    });
    yPos += 4;
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
