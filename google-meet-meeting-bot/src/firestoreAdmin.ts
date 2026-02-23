import admin from "firebase-admin";

let initialized = false;

function initAdminIfNeeded(): void {
	if (initialized) return;
	try {
		if (admin.apps.length > 0) {
			initialized = true;
			return;
		}

		// Prefer explicit JSON in env for container scenarios
		const saJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
		if (saJson) {
			const creds = JSON.parse(saJson);
			admin.initializeApp({ credential: admin.credential.cert(creds) });
			initialized = true;
			return;
		}

		// Fallback to GOOGLE_APPLICATION_CREDENTIALS path if provided
		const gacPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
		if (gacPath) {
			admin.initializeApp({ credential: admin.credential.applicationDefault() });
			initialized = true;
			return;
		}

		// Last resort: try to require a known repo path if mounted (developer env)
		try {
			// eslint-disable-next-line @typescript-eslint/no-var-requires
			const serviceAccount = require("../../onix_dashboard/backend/firebase-service-account.json");
			admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
			initialized = true;
			return;
		} catch (_) {
			throw new Error(
				"No Firebase admin credentials. Set FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS."
			);
		}
	} catch (err) {
		throw err;
	}
}

export function getFirestoreAdmin() {
	initAdminIfNeeded();
	return admin.firestore();
}

export const serverTimestamp = () => admin.firestore.FieldValue.serverTimestamp();

// Meeting schema helpers
type SummaryPayload = {
	content: string;
	generatedAt: Date;
	isFallback: boolean;
};

type ActionItem = {
	id: string;
	text: string;
	assignedTo?: string;
	dueDate?: Date;
};

export async function fsCreateOrUpdateMeeting(
	meetingId: string,
	data: {
		meetingTitle?: string;
		hostId?: string;
		startTime?: boolean; // if true, set to serverTimestamp
		endTime?: boolean; // if true, set to serverTimestamp
		transcriptAppend?: string; // append to transcript field
	}
): Promise<void> {
	const db = getFirestoreAdmin();
	const ref = db.collection("meetings").doc(meetingId);
	await db.runTransaction(async (tx: FirebaseFirestore.Transaction) => {
		const snap = await tx.get(ref);
		const updates: Record<string, any> = {};
		if (!snap.exists) {
			updates.meetingTitle = data.meetingTitle ?? "Untitled Meeting";
			if (data.hostId) updates.hostId = data.hostId;
			updates.startTime = data.startTime ? serverTimestamp() : null;
			updates.transcript = "";
		}
		if (data.meetingTitle !== undefined) updates.meetingTitle = data.meetingTitle;
		if (data.hostId !== undefined) updates.hostId = data.hostId;
		if (data.startTime) updates.startTime = serverTimestamp();
		if (data.endTime) updates.endTime = serverTimestamp();

		if (data.transcriptAppend) {
			const existing = snap.exists ? (snap.get("transcript") as string) || "" : "";
			updates.transcript = `${existing}${existing ? " " : ""}${data.transcriptAppend}`.trim();
		}

		if (!snap.exists) {
			tx.set(ref, updates, { merge: true });
		} else {
			tx.update(ref, updates);
		}
	});
}

export async function fsAddSegment(
	meetingId: string,
	segment: { text: string; speaker: string; timestamp: Date }
) {
	const db = getFirestoreAdmin();
	const segRef = db.collection("meetings").doc(meetingId).collection("segments").doc();
	await segRef.set({
		text: segment.text,
		speaker: segment.speaker,
		timestamp: admin.firestore.Timestamp.fromDate(segment.timestamp),
	});
}

export async function fsFinalizeMeetingDuration(meetingId: string): Promise<void> {
	const db = getFirestoreAdmin();
	const ref = db.collection("meetings").doc(meetingId);
	await db.runTransaction(async (tx: FirebaseFirestore.Transaction) => {
		const snap = await tx.get(ref);
		if (!snap.exists) return;
		const start = snap.get("startTime");
		const end = snap.get("endTime") ?? admin.firestore.Timestamp.now();
		// if endTime not set yet, set it now
		if (!snap.get("endTime")) {
			tx.update(ref, { endTime: serverTimestamp() });
		}
		if (start && end) {
			const durationSec = (end.toMillis() - start.toMillis()) / 1000;
			tx.update(ref, { duration: Math.max(0, Math.round(durationSec)) });
		}
	});
}

export async function fsSaveSummaryOnce(
	meetingId: string,
	summary: SummaryPayload
): Promise<boolean> {
	const db = getFirestoreAdmin();
	const ref = db.collection("meetings").doc(meetingId);
	return await db.runTransaction(async (tx: FirebaseFirestore.Transaction) => {
		const snap = await tx.get(ref);
		if (!snap.exists) return false;
		const existing = snap.get("summary");
		if (existing && existing.content) return false; // already exists
		if (summary.isFallback) return false; // do not persist fallback
		tx.update(ref, {
			summary: {
				content: summary.content,
				generatedAt: admin.firestore.Timestamp.fromDate(summary.generatedAt),
				isFallback: false,
			},
		});
		return true;
	});
}

export async function fsSaveActionItemsOnce(
	meetingId: string,
	actionItems: ActionItem[]
): Promise<void> {
	const db = getFirestoreAdmin();
	const ref = db.collection("meetings").doc(meetingId);
	await db.runTransaction(async (tx) => {
		const snap = await tx.get(ref);
		if (!snap.exists) return;
		const existing: ActionItem[] = snap.get("actionItems") || [];
		const seen = new Set(existing.map((i) => i.id));
		const merged = [...existing];
		for (const item of actionItems) {
			if (item.id && !seen.has(item.id)) {
				merged.push({
					id: item.id,
					text: item.text,
					assignedTo: item.assignedTo,
					dueDate: item.dueDate,
				});
				seen.add(item.id);
			}
		}
		tx.update(ref, { actionItems: merged });
	});
}

export async function fsDeleteMeeting(meetingId: string): Promise<boolean> {
  const db = getFirestoreAdmin();
  const ref = db.collection("meetings").doc(meetingId);
  
  try {
    const doc = await ref.get();
    if (!doc.exists) return false;

    // Delete segments subcollection (naive implementation for small meetings)
    const segments = await ref.collection("segments").limit(500).get();
    if (!segments.empty) {
      const batch = db.batch();
      segments.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
    
    await ref.delete();
    return true;
  } catch (err) {
    console.error(`[FS] Error deleting meeting ${meetingId}:`, err);
    return false;
  }
}


