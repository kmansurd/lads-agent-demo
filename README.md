# LADS Agent Demo — Course Analytics

Learning Analytics Data Storytelling (LADS) demo dashboard powered by **Canvas LMS** via a Next.js server-side BFF (Canvas REST API). No canvas-mcp dependency in the app runtime.

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
| Weekly Online Activity | Course activity stream + submission timestamps (weekly buckets); resource table from assignments & module items |
| Students | `analytics/student_summaries`, enrollments, roster |
| Discussions | Discussion topics and entries (network built from reply relationships) |

**Weekly activity note:** Canvas does not expose the same weekly page-view series as the original mock UI on the public REST API. This app buckets the **course activity feed** and **submission dates** into 16 weeks from the course start date, and documents the proxy in the UI.

## Scripts

- `npm run dev` — development
- `npm run build` — production build
- `npm run start` — production server
