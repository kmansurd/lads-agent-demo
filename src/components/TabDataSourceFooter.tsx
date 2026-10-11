'use client';

import React from 'react';
import { Typography } from '@mui/material';

type TabDataSourceFooterProps = {
  sources: string[];
  fetchedAt?: Date | null;
  note?: string;
};

export function TabDataSourceFooter({ sources, fetchedAt, note }: TabDataSourceFooterProps) {
  const timeLabel =
    fetchedAt && !Number.isNaN(fetchedAt.getTime())
      ? fetchedAt.toLocaleString()
      : null;

  return (
    <Typography
      variant="caption"
      component="p"
      color="text.secondary"
      sx={{ mt: 2, pt: 1, borderTop: 1, borderColor: 'divider' }}
    >
      {note ? `${note} ` : null}
      Data sources: {sources.join(' · ')}
      {timeLabel ? ` · Loaded ${timeLabel}` : null}
    </Typography>
  );
}
