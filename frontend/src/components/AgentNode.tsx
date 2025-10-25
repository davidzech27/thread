import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

interface AgentNodeData {
  title: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  isSelected: boolean;
}

const statusColors = {
  idle: '#d1d5db',
  running: '#3b82f6',
  completed: '#10b981',
  error: '#ef4444',
};

export const AgentNode = memo(({ data }: { data: AgentNodeData }) => {
  return React.createElement(
    'div',
    {
      style: {
        padding: '16px',
        borderRadius: '12px',
        border: `2px solid ${statusColors[data.status]}`,
        background: data.isSelected ? '#fecaca' : 'white',
        minWidth: '256px',
        minHeight: '170px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
        cursor: 'pointer',
      },
    },
    React.createElement(Handle, { type: 'target', position: Position.Top, style: { background: '#999' } }),
    React.createElement('p', { style: { fontWeight: 500, color: 'black', marginBottom: '8px' } }, data.title),
    React.createElement('p', { style: { fontSize: '14px', color: '#6b7280' } }, data.status),
    React.createElement(Handle, { type: 'source', position: Position.Bottom, style: { background: '#999' } })
  );
});

AgentNode.displayName = 'AgentNode';
