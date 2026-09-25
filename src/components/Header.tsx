
import React from 'react';
import { AppBar, Toolbar, Typography, Button } from '@mui/material';

const Header = ({
  onGenerateSummary,
  summaryLoading = false,
}: {
  onGenerateSummary: () => void;
  summaryLoading?: boolean;
}) => {
  return (
    <AppBar position="static" color="default" elevation={1}>
      <Toolbar>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          Course Analytics
        </Typography>
        <Button
          variant="contained"
          color="primary"
          onClick={onGenerateSummary}
          disabled={summaryLoading}
        >
          {summaryLoading ? 'Generating…' : 'Generate Summary'}
        </Button>
      </Toolbar>
    </AppBar>
  );
};

export default Header;
