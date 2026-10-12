
import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import {
  Box,
  Popover,
  TextField,
  Button,
  Typography,
  List,
  ListItem,
  IconButton,
  alpha,
} from '@mui/material';
import AutoStoriesOutlinedIcon from '@mui/icons-material/AutoStoriesOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import CloseIcon from '@mui/icons-material/Close';

export interface ChatBubbleHandle {
  openChat: () => void;
  addMessage: (text: string, sender: 'user' | 'bot') => void;
}

interface ChatBubbleProps {
  currentTab: string;
}

const ChatBubble = forwardRef<ChatBubbleHandle, ChatBubbleProps>(({ currentTab }, ref) => {
  const anchorRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<{ text: string; sender: 'user' | 'bot' }[]>([]);

  useEffect(() => {
    setAnchorEl(anchorRef.current);
  }, []);

  useImperativeHandle(ref, () => ({
    openChat: () => {
      setOpen(true);
    },
    addMessage: (text: string, sender: 'user' | 'bot') => {
      setMessages((prev) => [...prev, { text, sender }]);
    },
  }));

  const scrollToBottom = () => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
      return;
    }
    messagesEndRef.current?.scrollIntoView({ block: 'nearest' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, open]);

  const handleToggle = () => {
    setOpen((wasOpen) => !wasOpen);
  };

  const handleClose = () => {
    setOpen(false);
  };

  const handleRestart = () => {
    setMessages([]);
  };

  const handleAsk = () => {
    if (!question.trim()) return;

    const asked = question;
    const newMessages = [...messages, { text: asked, sender: 'user' as const }];
    setMessages(newMessages);
    setQuestion('');

    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          text: `I see you are asking about "${asked}" while looking at the ${currentTab}. How can I help you more with ${currentTab}?`,
          sender: 'bot',
        },
      ]);
    }, 500);
  };

  const id = open ? 'data-storyteller-popover' : undefined;

  return (
    <>
      <Box
        ref={anchorRef}
        sx={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          zIndex: 1200,
          pointerEvents: 'none',
        }}
      >
        <Box
          component="button"
          type="button"
          onClick={handleToggle}
          aria-label="Open Data Storyteller"
          aria-expanded={open}
          aria-controls={id}
          sx={{
            pointerEvents: 'auto',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 1,
            px: { xs: 1.5, sm: 2 },
            py: 1,
            border: '1px solid',
            borderColor: (theme) => alpha(theme.palette.text.primary, 0.12),
            borderRadius: 980,
            cursor: 'pointer',
            font: 'inherit',
            color: 'text.secondary',
            backgroundColor: (theme) => alpha(theme.palette.background.paper, 0.65),
            backdropFilter: 'saturate(180%) blur(16px)',
            WebkitBackdropFilter: 'saturate(180%) blur(16px)',
            boxShadow: '0 2px 12px rgba(0, 0, 0, 0.06)',
            transition: 'background-color 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease',
            '&:hover': {
              color: 'text.primary',
              backgroundColor: (theme) => alpha(theme.palette.background.paper, 0.82),
              borderColor: (theme) => alpha(theme.palette.text.primary, 0.18),
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
            },
            '&:focus-visible': {
              outline: '2px solid',
              outlineColor: 'primary.main',
              outlineOffset: 2,
            },
          }}
        >
          <AutoStoriesOutlinedIcon sx={{ fontSize: 20, opacity: 0.85 }} />
          <Typography
            component="span"
            variant="body2"
            sx={{
              fontWeight: 500,
              letterSpacing: '-0.01em',
              display: { xs: 'none', sm: 'inline' },
            }}
          >
            Data Storyteller
          </Typography>
        </Box>
      </Box>
      <Popover
        id={id}
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        disableScrollLock
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: {
              width: { xs: 320, sm: 380 },
              maxWidth: 'calc(100vw - 32px)',
              mt: -1,
            },
          },
        }}
      >
        <Box sx={{ p: 2.5, height: 460, display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                Data Storyteller
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {currentTab} tab
              </Typography>
            </Box>
            <Box>
              <IconButton onClick={handleRestart} size="small" title="Restart chat" aria-label="Restart chat">
                <RefreshIcon fontSize="small" />
              </IconButton>
              <IconButton onClick={handleClose} size="small" title="Close" aria-label="Close chat">
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>
          </Box>
          <Box
            ref={messagesContainerRef}
            sx={{
              flexGrow: 1,
              overflowY: 'auto',
              mb: 2,
              borderRadius: 3,
              p: 1.5,
              bgcolor: (theme) => alpha(theme.palette.text.primary, 0.03),
              border: '1px solid',
              borderColor: 'divider',
            }}
          >
            <List dense disablePadding>
              {messages.length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ px: 1, py: 2, textAlign: 'center' }}>
                  Ask anything about what you are viewing.
                </Typography>
              )}
              {messages.map((msg, index) => (
                <ListItem key={index} disableGutters sx={{ justifyContent: msg.sender === 'user' ? 'flex-end' : 'flex-start', py: 0.5 }}>
                  <Box
                    sx={{
                      bgcolor: msg.sender === 'user' ? 'primary.main' : 'background.paper',
                      color: msg.sender === 'user' ? 'primary.contrastText' : 'text.primary',
                      border: msg.sender === 'user' ? 'none' : '1px solid',
                      borderColor: 'divider',
                      borderRadius: 2.5,
                      px: 1.5,
                      py: 1,
                      maxWidth: '85%',
                      fontSize: '0.9375rem',
                      lineHeight: 1.45,
                      boxShadow: msg.sender === 'user' ? '0 2px 8px rgba(0,113,227,0.25)' : 'none',
                    }}
                  >
                    {msg.text}
                  </Box>
                </ListItem>
              ))}
              <div ref={messagesEndRef} />
            </List>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <TextField
              fullWidth
              placeholder="Ask a question…"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
            />
            <Button variant="contained" onClick={handleAsk}>
              Send
            </Button>
          </Box>
        </Box>
      </Popover>
    </>
  );
});

export default ChatBubble;
