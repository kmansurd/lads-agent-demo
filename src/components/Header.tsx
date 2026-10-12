
import React from 'react';
import { AppBar, Toolbar, Typography, Box } from '@mui/material';

const Header = () => {
  return (
    <AppBar position="static" color="default" sx={{ flexShrink: 0 }}>
      <Toolbar sx={{ minHeight: { xs: 56, sm: 64 }, px: { xs: 2, sm: 3 } }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600, letterSpacing: '-0.02em' }}>
            Course Analytics
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
            Insights from your Canvas course
          </Typography>
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Header;
