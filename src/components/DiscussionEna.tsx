'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  Link,
  MenuItem,
  Paper,
  Select,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useTheme,
  alpha,
} from '@mui/material';
import type { DiscussionPost } from '@/lib/canvas/discussions';
import {
  buildEna,
  displayLabel,
  ideaFromPhrase,
  studentKey,
  suggestIdeas,
  type EnaEdge,
  type EnaIdea,
  type EnaModel,
  type EnaWindow,
} from '@/lib/ena/analyze';

type EnaMapColors = {
  blue: string;
  orange: string;
  ink: string;
  studentMuted: string;
  ideaFill: string;
  ideaFillActive: string;
  markBg: string;
};

function useEnaMapColors(): EnaMapColors {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  return {
    blue: theme.palette.primary.main,
    orange: isDark ? '#ff9f0a' : '#bf4800',
    ink: theme.palette.text.primary,
    studentMuted: isDark ? '#98989d' : '#b0bec5',
    ideaFill: theme.palette.background.paper,
    ideaFillActive: isDark ? alpha(theme.palette.primary.main, 0.35) : '#e3f2fd',
    markBg: isDark ? 'rgba(255, 159, 10, 0.35)' : 'rgba(255, 149, 0, 0.18)',
  };
}

type DiscussionEnaProps = {
  posts: DiscussionPost[];
  prompt: string;
  loading: boolean;
};

function edgeKey(edge: EnaEdge): string {
  return `${edge.source}::${edge.target}`;
}

function prettyName(name: string): string {
  if (name === 'the rest of the class') return 'The rest of the class';
  return name;
}

function times(count: number): string {
  return `${count} ${count === 1 ? 'time' : 'times'}`;
}

function Highlight({ text, terms, markBg }: { text: string; terms: string[]; markBg: string }) {
  const parts = terms
    .map((term) => term.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  if (parts.length === 0) return <>{text}</>;
  const pattern = parts
    .map((term) => {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return term.includes(' ') ? escaped : `\\b${escaped}(?:s|es)?\\b`;
    })
    .join('|');
  const splitter = new RegExp(`(${pattern})`, 'gi');
  const exact = new RegExp(`^(?:${pattern})$`, 'i');
  return (
    <>
      {text.split(splitter).map((part, index) =>
        exact.test(part) ? (
          <Box key={`${part}-${index}`} component="mark" sx={{ bgcolor: markBg, color: 'text.primary', px: 0.25, borderRadius: 0.5 }}>
            {part}
          </Box>
        ) : (
          <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>
        ),
      )}
    </>
  );
}

function leadSentence(model: EnaModel, edge: EnaEdge | undefined): string {
  if (!edge) return 'No posts link these ideas together in this view.';
  const left = displayLabel(edge.source);
  const right = displayLabel(edge.target);
  if (model.mode === 'difference') {
    const aStronger = edge.signed >= 0;
    const stronger = prettyName(aStronger ? model.nameA : model.nameB ?? 'The other group');
    const strongerCount = aStronger ? edge.countA : edge.countB;
    const other = prettyName(aStronger ? model.nameB ?? 'the other group' : model.nameA);
    const otherCount = aStronger ? edge.countB : edge.countA;
    if (strongerCount >= otherCount) {
      return `${stronger} links ${left} with ${right} more often (${times(strongerCount)}; ${other} ${times(otherCount)}).`;
    }
    const otherLabel = other === 'The rest of the class' ? 'the rest of the class' : other;
    return `${left} with ${right} is a larger share of what ${stronger} wrote (${times(strongerCount)}) than of what ${otherLabel} wrote (${times(otherCount)}).`;
  }
  if (model.mode === 'student') {
    return `${model.nameA}'s strongest link is ${left} with ${right}, made ${times(edge.countA)}.`;
  }
  return `The strongest link is ${left} with ${right}, made ${times(edge.countA)} across the posts.`;
}

function MapView({
  model,
  ideas,
  selected,
  onSelect,
  colors,
}: {
  model: EnaModel;
  ideas: EnaIdea[];
  selected: string | null;
  onSelect: (key: string) => void;
  colors: EnaMapColors;
}) {
  const { blue: BLUE, orange: ORANGE, ink: INK, studentMuted, ideaFill, ideaFillActive } = colors;
  const width = 760;
  const height = 420;
  const pad = 78;
  const points = [...model.nodes, ...model.students];
  if (model.classMarker) points.push({ id: 'class', label: 'class', ...model.classMarker });
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, 1e-6);
  const spanY = Math.max(maxY - minY, 1e-6);
  const scale = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const place = (x: number, y: number) => ({
    x: width / 2 + (x - cx) * scale,
    y: height / 2 - (y - cy) * scale,
  });

  const maxWeight = model.edges.reduce((max, edge) => Math.max(max, edge.weight), 0) || 1;
  const nodeById = new Map(model.nodes.map((node) => [node.id, node]));
  const labelFor = (id: string) => ideas.find((idea) => idea.id === id)?.label ?? id;

  return (
    <Box sx={{ width: '100%', overflow: 'hidden', aspectRatio: `${width} / ${height}` }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        role="group"
        aria-label="Idea connection map"
      >
        {model.edges.map((edge) => {
          const source = nodeById.get(edge.source);
          const target = nodeById.get(edge.target);
          if (!source || !target || edge.weight <= 0) return null;
          const from = place(source.x, source.y);
          const to = place(target.x, target.y);
          const key = edgeKey(edge);
          const active = selected === key;
          const color = model.mode === 'difference' ? (edge.signed >= 0 ? BLUE : ORANGE) : BLUE;
          const widthPx = 1.25 + (edge.weight / maxWeight) * 7;
          return (
            <g key={key} onClick={() => onSelect(key)} style={{ cursor: 'pointer' }}>
              <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="transparent" strokeWidth={16} />
              <line
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={color}
                strokeWidth={active ? widthPx + 1.5 : widthPx}
                strokeOpacity={active ? 1 : 0.75}
                strokeLinecap="round"
              />
            </g>
          );
        })}
        {model.placed &&
          model.students.map((student) => {
            const spot = place(student.x, student.y);
            const isA = student.id === model.highlightA;
            const isB = student.id === model.highlightB;
            return (
              <circle
                key={student.id}
                cx={spot.x}
                cy={spot.y}
                r={isA || isB ? 6 : 3.5}
                fill={isA ? BLUE : isB ? ORANGE : studentMuted}
                opacity={isA || isB || model.mode === 'class' ? 0.95 : 0.55}
              >
                <title>{student.label}</title>
              </circle>
            );
          })}
        {model.classMarker ? (
          (() => {
            const spot = place(model.classMarker.x, model.classMarker.y);
            return (
              <rect
                x={spot.x - 6}
                y={spot.y - 6}
                width={12}
                height={12}
                fill={ORANGE}
                transform={`rotate(45 ${spot.x} ${spot.y})`}
              >
                <title>The rest of the class</title>
              </rect>
            );
          })()
        ) : null}
        {model.nodes.map((node) => {
          const spot = place(node.x, node.y);
          const dx = spot.x - width / 2;
          const dy = spot.y - height / 2;
          const len = Math.hypot(dx, dy) || 1;
          const labelX = spot.x + (dx / len) * 16;
          const labelY = spot.y + (dy / len) * 16;
          const active = selected != null && selected.split('::').includes(node.id);
          const text = displayLabel(labelFor(node.id));
          return (
            <g key={node.id} onClick={() => onSelect(node.id)} style={{ cursor: 'pointer' }}>
              <circle
                cx={spot.x}
                cy={spot.y}
                r={active ? 9 : 7}
                fill={active ? ideaFillActive : ideaFill}
                stroke={INK}
                strokeWidth={1.5}
              />
              <text
                x={labelX}
                y={labelY}
                textAnchor={dx >= 0 ? 'start' : 'end'}
                dominantBaseline="middle"
                fill={INK}
                fontSize={14}
                fontFamily="system-ui, sans-serif"
              >
                {text.length > 24 ? `${text.slice(0, 23)}…` : text}
              </text>
            </g>
          );
        })}
      </svg>
    </Box>
  );
}

const DiscussionEna = ({ posts, prompt, loading }: DiscussionEnaProps) => {
  const theme = useTheme();
  const enaColors = useEnaMapColors();
  const suggested = useMemo(() => suggestIdeas(posts, prompt), [posts, prompt]);
  const [ideas, setIdeas] = useState<EnaIdea[]>(suggested);
  const [usingSuggested, setUsingSuggested] = useState(true);
  const [draft, setDraft] = useState('');
  const [draftNote, setDraftNote] = useState<string | null>(null);
  const [windowMode, setWindowMode] = useState<EnaWindow>('recent');
  const [focus, setFocus] = useState('all');
  const [compare, setCompare] = useState('none');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [showAllEvidence, setShowAllEvidence] = useState(false);
  const postKey = posts.map((post) => post.id).join(',');

  useEffect(() => {
    setIdeas(suggested);
    setUsingSuggested(true);
    setDraft('');
    setDraftNote(null);
  }, [suggested]);

  useEffect(() => {
    setFocus('all');
    setCompare('none');
  }, [postKey]);

  const students = useMemo(() => {
    const counts = new Map<string, { id: string; name: string; count: number }>();
    for (const post of posts) {
      const id = studentKey(post);
      const existing = counts.get(id);
      if (existing) existing.count += 1;
      else counts.set(id, { id, name: post.authorName, count: 1 });
    }
    return [...counts.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [posts]);

  const model = useMemo(
    () =>
      buildEna({
        posts,
        ideas,
        window: windowMode,
        focus: focus === 'all' ? { kind: 'all' } : { kind: 'student', id: focus },
        compare: compare === 'none' ? null : { kind: 'student', id: compare },
      }),
    [posts, ideas, windowMode, focus, compare],
  );

  useEffect(() => {
    setSelectedKey(model.edges[0] ? edgeKey(model.edges[0]) : null);
    setShowAllEvidence(false);
  }, [model]);

  const selected = model.edges.find((edge) => edgeKey(edge) === selectedKey) ?? null;
  const selectedIdeas = ideas.filter((idea) => idea.id === selected?.source || idea.id === selected?.target);
  const evidence = selected?.evidence ?? [];
  const visibleEvidence = showAllEvidence ? evidence : evidence.slice(0, 4);

  const pointA = model.students.find((student) => student.id === model.highlightA);
  const pointB = model.highlightB
    ? model.students.find((student) => student.id === model.highlightB)
    : model.classMarker;
  const axisNote =
    model.mode === 'difference' && model.placed && pointA && pointB && pointA.x > pointB.x + 1e-4
      ? `${prettyName(model.nameA)} sits toward the right. ${prettyName(model.nameB ?? '')} sits toward the left.`
      : null;

  const windowHelp =
    windowMode === 'post'
      ? 'A link counts when one post contains both ideas.'
      : windowMode === 'thread'
        ? 'A link counts when a post mentions an idea and the other idea appeared anywhere earlier in the topic.'
        : 'A link counts when a post mentions an idea and the other idea is in that post or the three posts just before it.';

  const addIdea = () => {
    const idea = ideaFromPhrase(draft);
    if (!idea) {
      setDraftNote('Type a word or a short phrase.');
      return;
    }
    if (ideas.some((item) => item.id === idea.id)) {
      setDraftNote('That idea is already on the map.');
      return;
    }
    const mentioned = posts.some((post) => post.message.toLowerCase().includes(idea.label));
    setIdeas((current) => [...current, idea].slice(0, 8));
    setUsingSuggested(false);
    setDraft('');
    setDraftNote(mentioned ? null : 'No post contains that phrase yet. It will appear here if you add posts that use it.');
  };

  const initialLoad = loading && posts.length === 0;
  const refreshing = loading && posts.length > 0;

  return (
    <Paper sx={{ p: { xs: 2, sm: 2.5 }, mb: 2, position: 'relative' }}>
      {refreshing ? (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            zIndex: 2,
            bgcolor: alpha(theme.palette.background.paper, 0.88),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 1,
          }}
        >
          <CircularProgress size={28} />
        </Box>
      ) : null}
      <Typography variant="h6">Idea connections</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 760 }}>
        This map shows which ideas students bring up together in this discussion. Thicker lines are the links they
        make most often. Click a line to read the posts behind it.
      </Typography>
      <Box component="details" sx={{ mt: 1, maxWidth: 760 }}>
        <Box component="summary" sx={{ cursor: 'pointer', color: 'text.primary', fontSize: 14 }}>
          How to read this
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Each label is an idea the posts share. A line means a student mentioned those ideas in the same stretch of
          the conversation. Each dot is a student, and students who sit closer together link ideas in similar ways.
          Changing the ideas, the stretch of conversation, or the students rebuilds the map from these Canvas posts.
          This is a classroom version of{' '}
          <Link href="https://www.epistemicnetwork.org/" target="_blank" rel="noreferrer">
            epistemic network analysis
          </Link>
          , the method behind the{' '}
          <Link href="https://app.epistemicnetwork.org/" target="_blank" rel="noreferrer">
            ENA webtool
          </Link>
          .
        </Typography>
      </Box>

      {initialLoad ? (
        <Box
          sx={{
            mt: 2,
            minHeight: 420,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
          }}
        >
          <CircularProgress size={22} />
          <Typography color="text.secondary">Reading the discussion posts…</Typography>
        </Box>
      ) : posts.length < 2 ? (
        <Box sx={{ mt: 2, minHeight: 420, display: 'flex', alignItems: 'center' }}>
          <Typography color="text.secondary">
            This topic needs a few student posts before idea connections will show up.
          </Typography>
        </Box>
      ) : (
        <>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center', mt: 2 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Ideas
            </Typography>
            {ideas.map((idea) => (
              <Chip
                key={idea.id}
                label={displayLabel(idea.label)}
                onDelete={() => {
                  setIdeas((current) => current.filter((item) => item.id !== idea.id));
                  setUsingSuggested(false);
                }}
              />
            ))}
            {!usingSuggested ? (
              <Button
                size="small"
                onClick={() => {
                  setIdeas(suggested);
                  setUsingSuggested(true);
                  setDraftNote(null);
                }}
              >
                Restore suggested ideas
              </Button>
            ) : null}
          </Box>
          <Box sx={{ display: 'flex', gap: 1, mt: 1.5, maxWidth: 520 }}>
            <TextField
              size="small"
              fullWidth
              label="Add an idea"
              placeholder="A word or phrase from the posts"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') addIdea();
              }}
            />
            <Button variant="outlined" onClick={addIdea} sx={{ flexShrink: 0 }}>
              Add
            </Button>
          </Box>
          {draftNote ? (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              {draftNote}
            </Typography>
          ) : null}

          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center', mt: 2 }}>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={windowMode}
              onChange={(_event, value: EnaWindow | null) => {
                if (value) setWindowMode(value);
              }}
              aria-label="How far apart ideas can be and still count as linked"
            >
              <ToggleButton value="post">Same post</ToggleButton>
              <ToggleButton value="recent">Recent posts</ToggleButton>
              <ToggleButton value="thread">Whole thread</ToggleButton>
            </ToggleButtonGroup>
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel id="ena-show-label">Show</InputLabel>
              <Select
                labelId="ena-show-label"
                label="Show"
                value={focus}
                onChange={(event) => {
                  const next = event.target.value;
                  setFocus(next);
                  if (next !== 'all' && next === compare) setCompare('none');
                }}
              >
                <MenuItem value="all">All students</MenuItem>
                {students.map((student) => (
                  <MenuItem key={student.id} value={student.id}>
                    {student.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 220 }}>
              <InputLabel id="ena-compare-label">Compare with</InputLabel>
              <Select
                labelId="ena-compare-label"
                label="Compare with"
                value={compare === focus ? 'none' : compare}
                onChange={(event) => setCompare(event.target.value)}
              >
                <MenuItem value="none">Don&apos;t compare</MenuItem>
                {students
                  .filter((student) => student.id !== focus)
                  .map((student) => (
                    <MenuItem key={student.id} value={student.id}>
                      {student.name}
                    </MenuItem>
                  ))}
              </Select>
            </FormControl>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {windowHelp}
          </Typography>

          {ideas.length < 2 ? (
            <Typography sx={{ mt: 2 }} color="text.secondary">
              Add at least two ideas. Suggested ideas appear when the same words show up in more than one post.
            </Typography>
          ) : model.edges.length === 0 ? (
            <Typography sx={{ mt: 2 }} color="text.secondary">
              No posts link these ideas in this view. Try Whole thread, or add a word from your prompt.
            </Typography>
          ) : (
            <>
              <Box sx={{ minHeight: 420 }}>
                <MapView
                  model={model}
                  ideas={ideas}
                  selected={selectedKey}
                  colors={enaColors}
                  onSelect={(key) => {
                    const edge = model.edges.find((item) => edgeKey(item) === key);
                    if (edge) {
                      setSelectedKey(key);
                      setShowAllEvidence(false);
                      return;
                    }
                    const attached = model.edges.find(
                      (item) => item.source === key || item.target === key,
                    );
                    if (attached) {
                      setSelectedKey(edgeKey(attached));
                      setShowAllEvidence(false);
                    }
                  }}
                />
              </Box>
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                {model.mode === 'difference'
                  ? `Blue lines are stronger for ${prettyName(model.nameA)}. Orange lines are stronger for ${prettyName(model.nameB ?? 'the other group')}.`
                  : model.mode === 'student'
                    ? `The lines are ${model.nameA}'s connections. Dots nearby are students who link these ideas in a similar way.`
                    : 'The lines are the class pattern. Each dot is a student.'}
              </Typography>
              {axisNote ? (
                <Typography variant="body2" color="text.secondary">
                  {axisNote}
                </Typography>
              ) : null}
              {model.collapsed ? (
                <Typography variant="body2" color="text.secondary">
                  Students link these ideas in similar ways, so the map shows the shared pattern.
                </Typography>
              ) : null}
              <Typography sx={{ mt: 1.5 }}>{leadSentence(model, model.edges[0])}</Typography>

              {selected ? (
                <Box sx={{ mt: 2, p: 1.5, bgcolor: 'action.hover', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="subtitle2">
                    Posts that link {displayLabel(selected.source)} with {displayLabel(selected.target)}
                  </Typography>
                  {visibleEvidence.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                      No post text is available for this link.
                    </Typography>
                  ) : (
                    visibleEvidence.map((item) => (
                      <Box key={`${item.postId}-${item.side}`} sx={{ mt: 1.25 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {item.authorName}
                          {item.createdAt ? ` · ${new Date(item.createdAt).toLocaleString()}` : ''}
                          {model.mode === 'difference' &&
                          prettyName(item.side === 'a' ? model.nameA : model.nameB ?? '') !== item.authorName
                            ? ` · ${item.side === 'a' ? prettyName(model.nameA) : prettyName(model.nameB ?? '')}`
                            : ''}
                        </Typography>
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mt: 0.25 }}>
                          <Highlight
                            text={item.message.slice(0, 500)}
                            terms={selectedIdeas.flatMap((idea) => idea.terms)}
                            markBg={enaColors.markBg}
                          />
                        </Typography>
                        {item.context.map((context) => (
                          <Typography key={context.excerpt} variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                            Just before, {context.authorName}: {context.excerpt}
                          </Typography>
                        ))}
                      </Box>
                    ))
                  )}
                  {evidence.length > 4 ? (
                    <Button size="small" sx={{ mt: 1 }} onClick={() => setShowAllEvidence((open) => !open)}>
                      {showAllEvidence ? 'Show fewer posts' : `Show all ${evidence.length} posts`}
                    </Button>
                  ) : null}
                </Box>
              ) : null}

              <Box sx={{ mt: 2 }}>
                {model.edges.slice(0, 12).map((edge) => {
                  const key = edgeKey(edge);
                  const active = key === selectedKey;
                  return (
                    <Box
                      key={key}
                      component="button"
                      onClick={() => {
                        setSelectedKey(key);
                        setShowAllEvidence(false);
                      }}
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 2,
                        width: '100%',
                        textAlign: 'left',
                        border: 0,
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                        bgcolor: active ? 'action.selected' : 'transparent',
                        px: 1,
                        py: 0.75,
                        cursor: 'pointer',
                        font: 'inherit',
                        color: 'inherit',
                      }}
                    >
                      <Typography variant="body2">
                        {displayLabel(edge.source)} — {displayLabel(edge.target)}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>
                        {model.mode === 'difference'
                          ? `${prettyName(model.nameA)} ${edge.countA} · ${prettyName(model.nameB ?? '')} ${edge.countB}`
                          : times(edge.countA)}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>
            </>
          )}
        </>
      )}
    </Paper>
  );
};

export default DiscussionEna;
