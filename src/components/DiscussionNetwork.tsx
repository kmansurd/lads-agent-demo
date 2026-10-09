'use client';
import React, { useState, useCallback, useRef } from 'react';
import ForceGraph2D, { ForceGraphMethods, NodeObject, LinkObject } from 'react-force-graph-2d';
import { Box, Modal, Typography, List, ListItem, ListItemText, Button, ButtonGroup } from '@mui/material';
import useSize from '@react-hook/size';

// Custom interfaces extending the library's types
interface CustomNode extends NodeObject {
  id: string;
  name: string;
  posts: number;
  replies: number;
  group: number;
  postsContent?: string[];
}

interface CustomLink extends LinkObject {
  source: string | CustomNode;
  target: string | CustomNode;
  value: number;
}

interface GraphData {
  nodes: CustomNode[];
  links: CustomLink[];
}

const style = {
  position: 'absolute' as 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: 400,
  bgcolor: 'background.paper',
  border: '2px solid #000',
  boxShadow: 24,
  p: 4,
};

const DiscussionNetwork = ({ data }: { data: GraphData }) => {
  const [selectedNode, setSelectedNode] = useState<CustomNode | null>(null);
  const graphRef = useRef<ForceGraphMethods | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, height] = useSize(containerRef as React.RefObject<HTMLElement>);

  const handleNodeClick = useCallback((node: NodeObject) => {
    setSelectedNode(node as CustomNode);
  }, []);

  const handleClose = () => {
    setSelectedNode(null);
  };

  const handleZoomIn = () => {
    if (graphRef.current) {
      graphRef.current.zoom(graphRef.current.zoom() * 1.2, 500);
    }
  };

  const handleZoomOut = () => {
    if (graphRef.current) {
      graphRef.current.zoom(graphRef.current.zoom() * 0.8, 500);
    }
  };

  const getNodeVal = (node: NodeObject) => {
    const customNode = node as CustomNode;
    return (customNode.posts + customNode.replies) * 2;
  };

  return (
    <Box ref={containerRef} sx={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <ForceGraph2D
        ref={graphRef}
        width={width}
        height={height}
        graphData={data}
        nodeVal={getNodeVal}
        nodeColor={node => `hsl(${(node as CustomNode).group * 60}, 100%, 50%)`}
        linkColor={() => 'rgba(0,0,0,0.2)'}
        linkWidth={link => (link as CustomLink).value}
        onNodeClick={handleNodeClick}
        nodeCanvasObject={(node, ctx, globalScale) => {
          const customNode = node as CustomNode;
          const label = customNode.name;
          const fontSize = 12 / globalScale;
          ctx.font = `${fontSize}px Sans-Serif`;
          const textWidth = ctx.measureText(label).width;
          const bckgDimensions = [textWidth, fontSize].map(n => n + fontSize * 0.2);

          if (customNode.x !== undefined && customNode.y !== undefined) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.fillRect(customNode.x - bckgDimensions[0] / 2, customNode.y - bckgDimensions[1] / 2, bckgDimensions[0], bckgDimensions[1]);

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = 'black';
            ctx.fillText(label, customNode.x, customNode.y);
          }
        }}
        nodePointerAreaPaint={(node, color, ctx) => {
          const customNode = node as CustomNode;
          ctx.fillStyle = color;
          const bckgDimensions = [ctx.measureText(customNode.name).width, 12].map(n => n + 12 * 0.2);
          if (customNode.x !== undefined && customNode.y !== undefined) {
            ctx.fillRect(customNode.x - bckgDimensions[0] / 2, customNode.y - bckgDimensions[1] / 2, bckgDimensions[0], bckgDimensions[1]);
          }
        }}
      />
      <ButtonGroup sx={{ position: 'absolute', bottom: 8, left: 8, zIndex: 1 }}>
        <Button onClick={handleZoomIn}>Zoom In</Button>
        <Button onClick={handleZoomOut}>Zoom Out</Button>
      </ButtonGroup>
      {selectedNode && (
        <Modal
          open={!!selectedNode}
          onClose={handleClose}
          aria-labelledby="modal-modal-title"
          aria-describedby="modal-modal-description"
        >
          <Box sx={style}>
            <Typography id="modal-modal-title" variant="h6" component="h2">
              {selectedNode.name}
            </Typography>
            <Typography id="modal-modal-description" sx={{ mt: 2 }}>
              Posts: {selectedNode.posts} | Replies: {selectedNode.replies}
            </Typography>
            <List>
              {selectedNode.postsContent && selectedNode.postsContent.map((post, index) => (
                <ListItem key={index}>
                  <ListItemText primary={post} />
                </ListItem>
              ))}
            </List>
          </Box>
        </Modal>
      )}
    </Box>
  );
};

export default DiscussionNetwork;
