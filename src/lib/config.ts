export type DataSource = 'mock' | 'canvas';

export function getDataSource(): DataSource {
  const source = process.env.DATA_SOURCE?.toLowerCase();
  return source === 'canvas' ? 'canvas' : 'mock';
}

export function getCourseId(): string {
  return process.env.CANVAS_COURSE_ID ?? 'demo';
}

export function getCanvasConfig() {
  return {
    apiUrl: process.env.CANVAS_API_URL ?? '',
    apiToken: process.env.CANVAS_API_TOKEN ?? '',
    courseId: getCourseId(),
  };
}

export function isCanvasConfigured(): boolean {
  const { apiUrl, apiToken, courseId } = getCanvasConfig();
  return Boolean(apiUrl && apiToken && courseId && courseId !== 'demo');
}

export function getMcpServerPath(): string | undefined {
  return process.env.CANVAS_MCP_SERVER_PATH;
}

// ─── Formative / Summative classifier ────────────────────────────────────────
//
// Canvas has no built-in formative/summative flag.  We derive it from the
// assignment group name using the keyword lists below.
//
// Override: set FORMATIVE_GROUP_KEYWORDS or SUMMATIVE_GROUP_KEYWORDS in your
// .env.local as comma-separated strings to replace the defaults, e.g.
//   FORMATIVE_GROUP_KEYWORDS=quiz,lab,homework
//   SUMMATIVE_GROUP_KEYWORDS=exam,final,project,midterm
//
// Any assignment group that matches neither list is placed in "summative" by
// default (conservative: better to overcount summative than drop rows).

const DEFAULT_FORMATIVE = ['quiz', 'quizzes', 'hw', 'homework', 'assignment', 'assignments', 'lab', 'labs', 'exercise', 'exercises', 'practice'];
const DEFAULT_SUMMATIVE = ['exam', 'exams', 'midterm', 'midterms', 'final', 'finals', 'project', 'projects', 'capstone', 'test', 'tests'];

function parseKeywordEnv(envKey: string, defaults: string[]): string[] {
  const raw = process.env[envKey];
  if (!raw) return defaults;
  return raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

export function getFormativeKeywords(): string[] {
  return parseKeywordEnv('FORMATIVE_GROUP_KEYWORDS', DEFAULT_FORMATIVE);
}

export function getSummativeKeywords(): string[] {
  return parseKeywordEnv('SUMMATIVE_GROUP_KEYWORDS', DEFAULT_SUMMATIVE);
}

/**
 * Classify an assignment group name as 'formative' | 'summative'.
 * Returns 'summative' when the name matches neither list.
 */
export function classifyAssignmentGroup(groupName: string): 'formative' | 'summative' {
  const lower = groupName.toLowerCase();
  if (getFormativeKeywords().some(kw => lower.includes(kw))) return 'formative';
  if (getSummativeKeywords().some(kw => lower.includes(kw))) return 'summative';
  return 'summative';
}

