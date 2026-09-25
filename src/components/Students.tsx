'use client';

import React from 'react';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { useCourseData } from '@/hooks/useCourseData';
import { TabLoader } from '@/components/CourseDataState';
import type { StudentRow } from '@/lib/canvas/students';

const columns: GridColDef[] = [
  { field: 'id', headerName: 'ID', width: 90 },
  { field: 'name', headerName: 'Name', width: 180 },
  { field: 'grade', headerName: 'Grade', type: 'number', width: 110 },
  { field: 'pagesViewed', headerName: 'Pages viewed', type: 'number', width: 130 },
  { field: 'participations', headerName: 'Participations', type: 'number', width: 130 },
  { field: 'lastActivity', headerName: 'Last Activity', width: 160 },
];

type StudentsResponse = { students: StudentRow[] };

const Students = () => {
  const { data, loading, error } = useCourseData<StudentsResponse>('students');

  if (loading || error) {
    return <TabLoader loading={loading} error={error} />;
  }

  if (!data) return null;

  return (
    <div style={{ height: 'auto', width: '100%' }}>
      <DataGrid
        rows={data.students}
        columns={columns}
        autoHeight
        checkboxSelection
        initialState={{
          sorting: { sortModel: [{ field: 'name', sort: 'asc' }] },
        }}
      />
    </div>
  );
};

export default Students;
