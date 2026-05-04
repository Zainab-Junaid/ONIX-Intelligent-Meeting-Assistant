# Frontend_2 Verification Plan – Post-Merge (Phases 1–7)

Use this plan to verify all changes made when merging features from frontend_3 into frontend_2.

---

## 1. Artifact Checklist

Confirm these files exist and were not reverted:

| Phase | Path | Type |
|-------|------|------|
| 1 | `app/api/meeting-bot/live-ask/route.ts` | New |
| 1 | `lib/live-qa.ts` | New |
| 2 | `app/api/extension-meetings/generate-summary-pdf/route.ts` | New |
| 3 | `app/api/extension-meetings/live-ask/route.ts` | New |
| 4 | `app/api/extension-meetings/upload-recording/route.ts` | New |
| 5 | `components/ask-onix-popup.tsx` | New |
| 5 | `components/icons/chatbot-icon.tsx` | New |
| 6 | `components/meeting-card.tsx` | Modified (onAskOnixClick + Ask Onix button) |
| 6 | `app/meetings/page.tsx` | Modified (AskOnixPopup integration) |
| 7 | `app/meetings/page.tsx` | Modified (URL-based search) |

**Quick check (from repo root):**
```bash
cd frontend_2/onix_dashboard
# New files
test -f app/api/meeting-bot/live-ask/route.ts && echo "P1 live-ask OK"
test -f lib/live-qa.ts && echo "P1 live-qa OK"
test -f app/api/extension-meetings/generate-summary-pdf/route.ts && echo "P2 OK"
test -f app/api/extension-meetings/live-ask/route.ts && echo "P3 OK"
test -f app/api/extension-meetings/upload-recording/route.ts && echo "P4 OK"
test -f components/ask-onix-popup.tsx && echo "P5 popup OK"
test -f components/icons/chatbot-icon.tsx && echo "P5 icon OK"
# Modified files should contain expected symbols
grep -l "onAskOnixClick" components/meeting-card.tsx && echo "P6 card OK"
grep -l "AskOnixPopup" app/meetings/page.tsx && echo "P6 page OK"
grep -l "useSearchParams" app/meetings/page.tsx && echo "P7 URL search OK"
```

---

## 2. API Verification

Run from project root or use Postman/curl. Ensure backend/env is set where noted.

### 2.1 Phase 1: Meeting-bot live-ask

- **Endpoint:** `POST /api/meeting-bot/live-ask`
- **Body:** `{ "meetingId": "<valid-bot-meeting-id>", "question": "What was discussed?" }`
- **Headers:** `Content-Type: application/json`; auth if your app requires it.
- **Expected:** `200` with `{ "answer": "..." }`, or `400`/`502` if meetingId invalid or no transcript.
- **Env:** `NEXT_PUBLIC_BACKEND_URL` (optional), `ASSEMBLYAI_API_KEY` (optional; fallback logic if missing).

**Verification:**  
Call with a real bot meeting ID that has transcript; confirm answer is returned. Call with bad ID; confirm 400/502 and no server crash.

### 2.2 Phase 2: Extension-meetings generate-summary-pdf

- **Endpoint:** `POST /api/extension-meetings/generate-summary-pdf`
- **Headers:** `Content-Type: application/json`, `x-guest-mode: true`
- **Body:** `{ "transcript": "Speaker A: Hello\nSpeaker B: Hi", "meetingTitle": "Test" }`
- **Expected:** `200` with PDF binary and `Content-Type: application/pdf`, or `400`/`403`/`502` for bad input or failed summary.
- **Note:** Internally calls `POST /api/extension-meetings/generate-summary` (same origin).

**Verification:**  
Send a short transcript; confirm response is PDF and filename in `Content-Disposition` is as expected. Without `x-guest-mode: true`, confirm 403.

### 2.3 Phase 3: Extension-meetings live-ask

- **Endpoint:** `POST /api/extension-meetings/live-ask`
- **Body:** `{ "transcript": "...", "meetingTitle": "Meeting", "question": "Who spoke?" }`
- **Headers:** `Content-Type: application/json` (CORS headers in response).
- **Expected:** `200` with `{ "answer": "..." }` or `400` if question missing.

**Verification:**  
Send transcript + question; confirm answer. Send without `question`; confirm 400.

### 2.4 Phase 4: Extension-meetings upload-recording

- **Endpoint:** `POST /api/extension-meetings/upload-recording`
- **Headers:** `Authorization: Bearer <Firebase ID token>`
- **Body:** `FormData` with `meetingId` (string) and `recording` (file).
- **Expected:** `200` with `{ "success": true, "recordingUrl": "..." }`, or `401`/`400`/`500`.
- **Env:** Firebase configured via `backend/firebase-service-account.json` (no env vars in route).

**Verification:**  
With valid Firebase token and a small test file, confirm 200 and `recordingUrl`. Without token, confirm 401. With file >500 MB, confirm 400.

---

## 3. UI / Integration Verification

### 3.1 Phase 5: Components (no integration yet)

- **AskOnixPopup:** Renders with `isOpen`, `onClose`, `meetingId`, `meetingTitle`. No need to click from meetings page here; just confirm it compiles and can be rendered in isolation (e.g. story or temporary page).
- **ChatbotIcon:** Renders an SVG; used only where imported (e.g. sidebar in F3; not wired in F2 per rules). Confirm no import/lint errors.

### 3.2 Phase 6: AskOnixPopup on meetings page

1. Open `/meetings` (signed in).
2. **Bot meetings tab:** For any bot meeting card, confirm an “Ask Onix” (MessageCircle) icon button next to the three-dots menu.
3. Click “Ask Onix” on one card. Confirm:
   - A dialog opens with title “Ask Onix – Live Q&A”.
   - Meeting title/ID in the dialog matches the card.
4. Type a question and click Ask. Confirm:
   - Network: `POST /api/meeting-bot/live-ask` with body `{ meetingId: "<id>", question: "..." }`.
   - Either an answer appears in the dialog or an error message (e.g. no transcript).
5. **Extension meetings tab:** Same checks: “Ask Onix” on each card, dialog shows correct meeting, request goes to `/api/meeting-bot/live-ask` with that meeting’s ID.
6. Close dialog; confirm it closes and reopening works for another card.

### 3.3 Phase 7: URL-based search

1. Open `/meetings` (no query). Confirm list shows all meetings (or empty); URL stays `/meetings` or `/meetings?` only.
2. Open Filters, type in Search (e.g. “standup”). Confirm:
   - URL updates to `/meetings?q=standup` (or similar).
   - List filters to matching meetings only.
3. Reload the page. Confirm:
   - URL still has `?q=standup`.
   - Search input still shows “standup”.
   - Filtered list is the same.
4. Clear search (X in search field). Confirm URL loses `q` and list shows all again.
5. Click “Clear all filters”. Confirm search clears and URL no longer has `q` (and date filter resets if implemented).

---

## 4. Environment & Config Checklist

- **Phase 1 & 3:** `ASSEMBLYAI_API_KEY` (optional for live-ask; fallback behavior without it). `NEXT_PUBLIC_BACKEND_URL` for meeting-bot live-ask (default `http://localhost:3001`).
- **Phase 2:** No extra env; uses existing generate-summary and pdf-generator.
- **Phase 4:** `backend/firebase-service-account.json` present and valid; Firebase Storage/Firestore enabled for the project.
- **Build:** If project has other build errors (e.g. missing firebase path, mongoose), those are pre-existing; the new routes and components should not introduce new TypeScript/lint errors in the modified files.

---

## 5. Minimal Smoke Flow (E2E-style)

1. Start app: `npm run dev` in `frontend_2/onix_dashboard`.
2. Sign in and go to **Meetings**.
3. **Search:** Set `?q=test` in URL; reload; confirm search input and filtered list.
4. **Ask Onix:** Click Ask Onix on a bot meeting; submit a question; confirm request to `/api/meeting-bot/live-ask` and answer or error in dialog.
5. **APIs (optional):** If backend/env are set, call each new API once (live-ask, generate-summary-pdf, extension live-ask, upload-recording) and confirm expected status and response shape.

---

## 6. Regression Checks

- **Search/filter/sort:** Same behavior as before; only source of search is URL. Date filter and sort unchanged unless you changed them.
- **Meetings page:** No removal of existing behavior (delete, start bot, start extension, tabs, view all).
- **AI Chatbot page:** Unchanged; still uses existing chatbot component and `/api/ai/*`.
- **Meeting-bot routes:** Only addition was `live-ask`; no other meeting-bot routes modified.
- **Extension-meetings routes:** Only additions (generate-summary-pdf, live-ask, upload-recording); no changes to existing extension-meetings routes.

---

## 7. Sign-Off Summary

| # | Item | Verified (Y/N) |
|---|------|----------------|
| 1 | All new/modified files present | |
| 2 | meeting-bot live-ask API | |
| 3 | extension-meetings generate-summary-pdf API | |
| 4 | extension-meetings live-ask API | |
| 5 | extension-meetings upload-recording API | |
| 6 | AskOnixPopup + ChatbotIcon components | |
| 7 | Ask Onix button and popup on meetings page | |
| 8 | Popup calls /api/meeting-bot/live-ask with correct meetingId | |
| 9 | Search driven by URL; reload preserves query | |
| 10 | No regressions (search, filters, delete, tabs) | |

Use this table to tick off each item after verification.
