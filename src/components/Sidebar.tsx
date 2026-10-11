
'use client';
import React, { useState } from 'react';
import { Box, List, ListItem, ListItemText, Divider, ListItemButton, Collapse, FormControl, InputLabel, Select, MenuItem, SelectChangeEvent, Tooltip, CircularProgress } from '@mui/material';
import { ExpandLess, ExpandMore } from '@mui/icons-material';
import { useCourse } from '@/context/CourseContext';

const Sidebar = () => {
  const [openSettings, setOpenSettings] = useState(false);
  const { courses, courseId, setCourseId, loading } = useCourse();

  const handleSettingsClick = () => {
    setOpenSettings(!openSettings);
  };

  const handleCourseChange = (event: SelectChangeEvent) => {
    setCourseId(event.target.value);
  };

  return (
    <Box sx={{ width: 250, bgcolor: 'background.paper', height: '100vh', borderRight: '1px solid #ddd' }}>
      <List>
        <ListItem>
          <Tooltip title="Learning Analytics Data Storytelling Agent">
            <ListItemText 
              primary="LADS Agent" 
              primaryTypographyProps={{ 
                variant: 'h5', 
                fontWeight: 'bold', 
                fontStyle: 'italic',
                align: 'center'
              }} 
            />
          </Tooltip>
        </ListItem>
        <Divider />
        <ListItemButton>
          <ListItemText primary="Dashboard" />
        </ListItemButton>
        <ListItemButton onClick={handleSettingsClick}>
          <ListItemText primary="Settings" />
          {openSettings ? <ExpandLess /> : <ExpandMore />}
        </ListItemButton>
        <Collapse in={openSettings} timeout="auto" unmountOnExit>
          <List component="div" disablePadding>
            <ListItem sx={{ pl: 4, pr: 2, pb: 2 }}>
               <FormControl fullWidth size="small" disabled={loading || courses.length === 0}>
                <InputLabel id="course-select-label">Course</InputLabel>
                <Select
                  labelId="course-select-label"
                  id="course-select"
                  value={courseId ?? ''}
                  label="Course"
                  onChange={handleCourseChange}
                >
                  {loading && (
                    <MenuItem value="">
                      <CircularProgress size={18} />
                    </MenuItem>
                  )}
                  {courses.map((course) => (
                    <MenuItem key={course.id} value={String(course.id)}>
                      {course.term ? `${course.name} (${course.term})` : course.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </ListItem>
          </List>
        </Collapse>
      </List>
    </Box>
  );
};

export default Sidebar;
