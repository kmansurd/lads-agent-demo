import fs from 'fs';

for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
}

const base = process.env.CANVAS_API_URL.replace(/\/$/, '');
const headers = { Authorization: `Bearer ${process.env.CANVAS_API_TOKEN}`, Accept: 'application/json' };
const cid = 72953;

const summaries = await fetch(`${base}/courses/${cid}/analytics/student_summaries?per_page=30`, {
  headers,
}).then((r) => r.json());

const patterns = { pages: 0, files: 0, assignments: 0, quizzes: 0, discussions: 0, other: 0 };
const samples = [];

for (const s of summaries) {
  const ua = await fetch(`${base}/courses/${cid}/analytics/users/${s.id}/activity`, { headers }).then(
    (r) => r.json(),
  );
  for (const p of ua.participations ?? []) {
    const url = p.url ?? '';
    if (url.includes('/pages/')) patterns.pages++;
    else if (url.includes('/files/')) patterns.files++;
    else if (url.includes('/assignments/')) patterns.assignments++;
    else if (url.includes('/quizzes/')) patterns.quizzes++;
    else if (url.includes('/discussion_topics/')) patterns.discussions++;
    else patterns.other++;
    if (samples.length < 20 && /\/courses\/72953\//.test(url)) samples.push(url);
  }
}

console.log('patterns', patterns);
console.log('samples', samples);
