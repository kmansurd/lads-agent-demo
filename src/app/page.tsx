'use client';
import React from 'react';
import { Box } from '@mui/material';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import CourseGrade from '@/components/CourseGrade';
import Engagement from '@/components/Engagement';
import Students from '@/components/Students';
import Discussions from '@/components/Discussions';
import { Overview } from '@/components/Overview';
import ChatBubble from '@/components/ChatBubble';
import { CourseProvider } from '@/context/CourseContext';
import { CanvasAuthProvider } from '@/context/CanvasAuthContext';
import { NavigationProvider, useNavigation, viewLabel } from '@/context/NavigationContext';
import { CourseShell } from '@/components/CourseDataState';
import { CanvasCapabilitiesBanner } from '@/components/CanvasCapabilitiesBanner';

function MainContent() {
  const { view } = useNavigation();

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1400, mx: 'auto', width: '100%' }}>
      {view === 'overview' && <Overview />}
      {view === 'grades' && <CourseGrade />}
      {view === 'engagement' && <Engagement />}
      {view === 'students' && <Students />}
      {view === 'discussions' && <Discussions />}
    </Box>
  );
}

function Dashboard() {
  const { view } = useNavigation();

  return (
    <Box
      sx={{
        display: 'flex',
        height: '100vh',
        maxHeight: '100vh',
        overflow: 'hidden',
        bgcolor: 'background.default',
      }}
    >
      <Sidebar />
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <Header />
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <CanvasCapabilitiesBanner />
          <CourseShell>
            <MainContent />
          </CourseShell>
        </Box>
      </Box>
      <ChatBubble currentTab={viewLabel(view)} />
    </Box>
  );
}

export default function Home() {
  return (
    <CanvasAuthProvider>
      <CourseProvider>
        <NavigationProvider>
          <Dashboard />
        </NavigationProvider>
      </CourseProvider>
    </CanvasAuthProvider>
  );
}
