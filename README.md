# LADS Agent Demo — Course Analytics

Learning Analytics Data Storytelling (LADS) demo dashboard powered by **Canvas LMS** via a Next.js server-side BFF (Canvas REST API).

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy [canvas.env.template](./canvas.env.template) to `.env.local` and set:

- `CANVAS_API_URL` — must end with `/api/v1` (e.g. `https://canvas.instructure.com/api/v1`)
- `CANVAS_API_TOKEN` — instructor or TA token with roster, gradebook, and analytics access

3. Run the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Choose a course under **Settings** in the sidebar.

## Data sources by tab

| Tab | Canvas APIs |
|-----|-------------|
| Gradebook | Enrollments (current scores), assignments, submissions, assignment groups |
| Engagement | `analytics/activity` (weekly course totals), `analytics/assignments` (submission timing / metrics when available) |
| Students | `analytics/student_summaries`, enrollments, roster |
| Discussions | Discussion topics and entries (network built from reply relationships) |

**Engagement note:** This tab mirrors **course-wide** Canvas Analytics activity and **assignment-level** analytics only. It does not replicate New Analytics per-module “Resources” or People → Access Report (no supported single REST aggregate for that).

When you select a course, the dashboard probes Canvas (`GET /api/courses/:courseId/capabilities`) and shows which analytics endpoints your token can use. Each tab lists its REST data sources and load time at the bottom.

## Scripts

- `npm run dev` — development
- `npm run build` — production build
- `npm run start` — production server
