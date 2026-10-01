# LADS Agent Demo — Course Analytics

Learning Analytics Data Storytelling (LADS) demo dashboard powered by **Canvas LMS** via a Next.js server-side BFF (Canvas REST API).

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy [canvas.env.template](./canvas.env.template) to `.env.local` and set:

- `CANVAS_API_URL` — must include `/api/v1` (e.g. `https://canvas.instructure.com/api/v1`)
- `CANVAS_API_TOKEN` — instructor or TA token with roster, gradebook, and analytics access

3. Run the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Choose a course under **Settings** in the sidebar.

## Data sources by tab

| Tab | Canvas APIs |
|-----|-------------|
| Course Grade | Enrollments (current scores), assignment submissions |
| Weekly Online Activity | Canvas Analytics `…/analytics/activity` (daily → course/term weeks); resources from published module items + assignment analytics + per-student analytics/page views |
| Students | `analytics/student_summaries`, enrollments, roster |
| Discussions | Discussion topics and entries (network built from reply relationships) |

**Weekly activity note:** Weeks follow Canvas course or enrollment term dates when set. The resources table lists published module content; metrics combine Canvas assignment analytics with per-student participation and page-view history (large rosters sample page views for performance).

## Scripts

- `npm run dev` — development
- `npm run build` — production build
- `npm run start` — production server
