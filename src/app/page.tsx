'use client';
import React, { useState, useRef } from 'react';
import { Box, Tabs, Tab, Typography, Paper, Button } from '@mui/material';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import CourseGrade from '@/components/CourseGrade';
import WeeklyOnlineActivity from '@/components/WeeklyOnlineActivity';
import Students from '@/components/Students';
import Discussions from '@/components/Discussions';
import ChatBubble, { ChatBubbleHandle } from '@/components/ChatBubble';
import { CourseProvider, useCourse } from '@/context/CourseContext';
import { CourseShell } from '@/components/CourseDataState';

function TabPanel(props: { children?: React.ReactNode; index: number; value: number }) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          <Box>{children}</Box>
        </Box>
      )}
    </div>
  );
}

const TAB_KEYS = ['grades', 'activity', 'students', 'discussions'] as const;

function Dashboard() {
  const [value, setValue] = useState(0);
  const [summary, setSummary] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);
  const chatRef = useRef<ChatBubbleHandle>(null);
  const { courseId } = useCourse();

  const handleChange = (_event: React.SyntheticEvent, newValue: number) => {
    setValue(newValue);
    setSummary('');
  };

  const handleAskMore = () => {
    if (chatRef.current) {
      chatRef.current.openChat();
      chatRef.current.addMessage(`I want to ask more about this summary: ${summary}`, 'user');
      setTimeout(() => {
        chatRef.current?.addMessage("Sure, what would you like to know more about?", 'bot');
      }, 500);
    }
  };

  const handleGenerateSummary = async () => {
    if (!courseId) return;
    setSummaryLoading(true);
    try {
      const tab = TAB_KEYS[value];
      const res = await fetch(`/api/courses/${courseId}/summary?tab=${tab}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Summary failed');
      setSummary(body.summary ?? '');
    } catch (e) {
      setSummary(e instanceof Error ? e.message : 'Could not generate summary');
    } finally {
      setSummaryLoading(false);
    }
  };

  return (
    <Box sx={{ display: 'flex' }}>
      <Sidebar />
      <Box sx={{ flexGrow: 1 }}>
        <Header onGenerateSummary={handleGenerateSummary} summaryLoading={summaryLoading} />
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={value} onChange={handleChange} aria-label="course analytics tabs">
            <Tab label="Course Grade" />
            <Tab label="Weekly Online Activity" />
            <Tab label="Students" />
            <Tab label="Discussions" />
          </Tabs>
        </Box>
        {summary && (
          <Paper elevation={3} sx={{ p: 2, m: 2, bgcolor: 'action.hover' }}>
            <Typography variant="h6">Summary</Typography>
            <Typography>{summary}</Typography>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
              <Button size="small" variant="contained" color="primary" onClick={handleAskMore}>
                Ask more
              </Button>
            </Box>
          </Paper>
        )}
        <CourseShell>
          <TabPanel value={value} index={0}>
            <CourseGrade />
          </TabPanel>
          <TabPanel value={value} index={1}>
            <WeeklyOnlineActivity />
          </TabPanel>
          <TabPanel value={value} index={2}>
            <Students />
          </TabPanel>
          <TabPanel value={value} index={3}>
            <Discussions />
          </TabPanel>
        </CourseShell>
      </Box>
      <ChatBubble ref={chatRef} currentTab={["Course Grade", "Weekly Online Activity", "Students", "Discussions"][value]} />
    </Box>
  );
}

export default function Home() {
  return (
    <CourseProvider>
      <Dashboard />
    </CourseProvider>
  );
}
