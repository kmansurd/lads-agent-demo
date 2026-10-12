import type { DataGridProps } from '@mui/x-data-grid';

declare module '@mui/material/styles' {
  interface Components {
    MuiDataGrid?: {
      defaultProps?: Partial<DataGridProps>;
      styleOverrides?: {
        root?: Record<string, unknown>;
      };
    };
  }
}

export {};
