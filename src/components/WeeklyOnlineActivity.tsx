'use client';
import React from 'react';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { Box, Typography, Alert } from '@mui/material';
import AssignmentIcon from '@mui/icons-material/Assignment';
import HomeIcon from '@mui/icons-material/Home';
import DescriptionIcon from '@mui/icons-material/Description';
import { useCourseData } from '@/hooks/useCourseData';
import { TabLoader } from '@/components/CourseDataState';
import type { WeeklyActivityPayload } from '@/lib/canvas/activity';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const columns: GridColDef[] = [
  {
    field: 'resource',
    headerName: 'Resource',
    flex: 1,
    renderCell: (params) => {
      let Icon = AssignmentIcon;
      if (params.row.type === 'home') Icon = HomeIcon;
      if (params.row.type === 'file') Icon = DescriptionIcon;

      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, height: '100%' }}>
          <Icon color="action" fontSize="small" />
          <Typography variant="body2" noWrap title={params.value}>
            {params.value}
          </Typography>
        </Box>
      );
    },
  },
  { field: 'students', headerName: 'Students', width: 100, type: 'number', align: 'center', headerAlign: 'center' },
  { field: 'pageViews', headerName: 'Interactions', width: 120, align: 'center', headerAlign: 'center' },
  { field: 'participations', headerName: 'Participations', width: 130, type: 'number', align: 'center', headerAlign: 'center' },
];

const WeeklyOnlineActivity = () => {
  const { data, loading, error } = useCourseData<WeeklyActivityPayload>('activity');

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: { position: 'top' as const },
      title: {
        display: true,
        text: 'Weekly Online Activity (Canvas-derived)',
      },
    },
    scales: {
      y: {
        type: 'linear' as const,
        display: true,
        position: 'left' as const,
        title: { display: true, text: 'Activity events' },
      },
      y1: {
        type: 'linear' as const,
        display: true,
        position: 'right' as const,
        grid: { drawOnChartArea: false },
        title: { display: true, text: 'Participations' },
      },
    },
  };

  if (loading || error) {
    return <TabLoader loading={loading} error={error} />;
  }

  if (!data) return null;

  const weeklyActivityData = {
    labels: data.chart.labels,
    datasets: [
      {
        label: 'Activity (stream proxy)',
        data: data.chart.pageViews,
        fill: false,
        borderColor: 'rgb(75, 192, 192)',
        tension: 0.1,
        yAxisID: 'y',
      },
      {
        label: 'Participations',
        data: data.chart.participations,
        fill: false,
        borderColor: 'rgb(255, 99, 132)',
        tension: 0.1,
        yAxisID: 'y1',
      },
    ],
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4, height: '100%' }}>
      <Alert severity="info" sx={{ mb: 0 }}>
        {data.chart.note}
      </Alert>
      <Box sx={{ height: 300 }}>
        <Line options={options} data={weeklyActivityData} />
      </Box>
      <Box sx={{ height: 400, width: '100%' }}>
        <Typography variant="h6" gutterBottom>
          Resources
        </Typography>
        <DataGrid
          rows={data.resources}
          columns={columns}
          initialState={{
            pagination: { paginationModel: { pageSize: 20 } },
          }}
          pageSizeOptions={[20, 50, 100]}
          disableRowSelectionOnClick
        />
      </Box>
    </Box>
  );
};

export default WeeklyOnlineActivity;
