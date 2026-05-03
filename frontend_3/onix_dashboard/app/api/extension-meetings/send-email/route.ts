import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import admin from 'firebase-admin';
import { getFirebaseAdmin } from '../../../../lib/firebase-admin';
import { sendEmail, generateSummaryEmailHTML } from '@/lib/email-service';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { handleOptions, withCors } from '../../../../lib/cors';


// Initialize Firebase Admin
getFirebaseAdmin();



// Helper to organize notes by type
function organizeNotesByType(notes: any[]) {
    const sections: Record<string, any[]> = {
        'concept': [],
        'definition': [],
        'clarification': [],
        'screenshot': [],
        'reminder': [],
        'urgent': [],
        'general': []
    };

    notes.forEach(note => {
        const type = note.type || 'general';
        if (sections[type]) {
            sections[type].push(note);
        } else {
            sections['general'].push(note);
        }
    });

    return sections;
}

// Helper to get image data as base64 from URL
async function getImgData(url: string): Promise<string | null> {
    try {
        const response = await fetch(url);
        if (!response.ok) return null;
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        return `data:image/png;base64,${buffer.toString('base64')}`;
    } catch (error) {
        console.error('Error fetching image:', error);
        return null;
    }
}


export async function OPTIONS() {
  return handleOptions();
}

export async function POST(request: NextRequest) {
    try {
        // Get Firebase token from headers
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return withCors(NextResponse.json({ error: 'No token provided' }, { status: 401 }));
        }

        const token = authHeader.split('Bearer ')[1];

        // Verify Firebase token
        const decodedToken = await getAuth().verifyIdToken(token);
        const userId = decodedToken.uid;

        // Get request body
        const { meetingId, recipients } = await request.json();

        if (!meetingId || !recipients || !Array.isArray(recipients)) {
            return withCors(NextResponse.json({ error: 'Meeting ID and recipients array are required' }, { status: 400 }));
        }

        // Fetch meeting data from Firestore
        const db = admin.firestore();
        const docRef = db.collection('users').doc(userId).collection('meetings').doc(meetingId);
        const docSnap = await docRef.get();

        if (!docSnap.exists) {
            return withCors(NextResponse.json({ error: 'Meeting not found' }, { status: 404 }));
        }

        const meetingData = docSnap.data() || {};
        const title = meetingData.title || 'Untitled Meeting';
        const summaryText = meetingData.summary?.text || 'No summary available.';
        const actionItems = meetingData.actionItems || [];

        // Filter notes to remove redundant summary content
        const rawNotes = meetingData.notes || [];
        const notes = rawNotes.filter((note: any) => {
            const text = (note.text || '').toLowerCase();

            // 1. Skip notes that are likely just summary headers
            const isSummaryHeader =
                text.includes('executive summary') ||
                text.includes('key discussion points') ||
                text.includes('decisions made') ||
                text.includes('next steps') ||
                text.includes('action items') ||
                text.includes('important information');

            // 2. Skip "No items identified" boilerplate text
            const isBoilerplate =
                text.includes('no specific action items') ||
                text.includes('no follow-up actions') ||
                text.includes('no decisions recorded') ||
                text.includes('no specific tasks identified');

            // 3. Skip if it's remarkably similar to any part of the summary
            // (The AI notes generator sometimes emits pieces of the summary as notes)
            const isDuplicateOfSummary = summaryText.toLowerCase().includes(text.substring(0, 80)) && text.length > 30;

            return !isSummaryHeader && !isBoilerplate && !isDuplicateOfSummary;
        });

        const createdAt = meetingData.createdAt?.toDate ? meetingData.createdAt.toDate() : new Date();
        const dateStr = createdAt.toLocaleString();

        // Generate PDF
        let pdfBase64 = '';
        try {
            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.getWidth();

            // Header
            doc.setFillColor(76, 81, 191); // #4c51bf
            doc.rect(0, 0, pageWidth, 40, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(24);
            doc.text('Meeting Insights', 20, 20);
            doc.setFontSize(10);
            doc.text(`Generated on ${new Date().toLocaleDateString()}`, 20, 30);

            let yPos = 55;

            // Meeting Title
            doc.setTextColor(26, 32, 44);
            doc.setFontSize(20);
            doc.text(title, 20, yPos);
            yPos += 10;
            doc.setFontSize(10);
            doc.setTextColor(113, 128, 150);
            doc.text(`Meeting Date: ${dateStr}`, 20, yPos);
            yPos += 15;

            // Organized Notes Section
            const organizedNotes = organizeNotesByType(notes);
            const typeLabels: Record<string, { label: string, color: [number, number, number] }> = {
                'concept': { label: 'Key Concepts', color: [49, 130, 206] },
                'definition': { label: 'Definitions', color: [128, 90, 213] },
                'clarification': { label: 'Clarifications', color: [56, 178, 172] },
                'screenshot': { label: 'Screenshots', color: [45, 55, 72] },
                'reminder': { label: 'Reminders', color: [221, 107, 32] },
                'urgent': { label: 'Urgent Items', color: [229, 62, 62] },
                'general': { label: 'General Notes', color: [113, 128, 150] }
            };

            for (const [type, typeNotes] of Object.entries(organizedNotes)) {
                if (typeNotes.length === 0) continue;

                if (yPos > 240) { doc.addPage(); yPos = 20; }

                const theme = typeLabels[type] || typeLabels.general;
                doc.setFillColor(theme.color[0], theme.color[1], theme.color[2]);
                doc.rect(15, yPos, 5, 10, 'F');
                doc.setTextColor(theme.color[0], theme.color[1], theme.color[2]);
                doc.setFontSize(14);
                doc.text(theme.label, 25, yPos + 7);
                yPos += 15;

                for (const note of typeNotes) {
                    if (yPos > 260) { doc.addPage(); yPos = 20; }

                    // Timestamp
                    const time = new Date(note.timestamp?.toDate ? note.timestamp.toDate() : Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    doc.setFontSize(8);
                    doc.setTextColor(160, 174, 192);
                    doc.text(time, 20, yPos);

                    // Note content
                    doc.setFontSize(10);
                    doc.setTextColor(45, 55, 72);
                    const splitNote = doc.splitTextToSize(note.text || (note.screenshotUrl ? '[Captured Screenshot]' : ''), pageWidth - 50);
                    doc.text(splitNote, 35, yPos);

                    yPos += (splitNote.length * 5) + 5;

                    // Screenshot
                    if (note.screenshotUrl) {
                        const imgData = await getImgData(note.screenshotUrl);
                        if (imgData) {
                            if (yPos > 180) { doc.addPage(); yPos = 20; }
                            try {
                                doc.addImage(imgData, 'PNG', 35, yPos, 140, 80);
                                yPos += 85;
                            } catch (e) {
                                console.error('Failed to add image to PDF:', e);
                            }
                        }
                    }

                    yPos += 5;
                }
                yPos += 10;
            }

            const pdfArrayBuffer = doc.output('arraybuffer');
            pdfBase64 = Buffer.from(pdfArrayBuffer).toString('base64');
        } catch (pdfError) {
            console.error('Error generating PDF:', pdfError);
        }

        // Prepare email - Only pass summary and action items to the template
        const html = generateSummaryEmailHTML(title, summaryText, dateStr, undefined, actionItems);
        const subject = `Meeting Insights: ${title}`;

        const attachments = pdfBase64 ? [{
            content: pdfBase64,
            filename: `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_notes.pdf`,
            type: 'application/pdf'
        }] : [];

        // Send email
        await sendEmail({
            to: recipients,
            subject,
            html,
            attachments
        });

        // Update Firestore
        await docRef.update({
            summaryEmailSent: true,
            summaryEmailSentAt: admin.firestore.Timestamp.now(),
            summaryEmailRecipients: recipients
        });

        return withCors(NextResponse.json({ success: true, message: `Email sent to ${recipients.length} recipients` }));

    } catch (error: any) {
        console.error('❌ Error in send-email API:', error);
        return withCors(NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 }));
    }
}

