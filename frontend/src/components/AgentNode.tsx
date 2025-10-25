import React, { memo, useState, useRef, useEffect } from 'react';
import { Handle, Position } from '@xyflow/react';

interface AgentNodeData {
  title: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  isSelected: boolean;
  isRoot?: boolean;
  context?: string;
  submittedContexts?: string[];
  onContextChange?: (context: string) => void;
  onContextSubmit?: (context: string) => void;
  onDelete?: () => void;
}

const statusColors = {
  idle: '#d1d5db',
  running: '#3b82f6',
  completed: '#10b981',
  error: '#ef4444',
};

export const AgentNode = memo(({ data }: { data: AgentNodeData }) => {
  const [context, setContext] = useState(data.context || '');
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep local state in sync with prop changes
  useEffect(() => {
    setContext(data.context || '');
  }, [data.context]);

  const handleContextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setContext(e.target.value);
    // Don't call onContextChange on every keystroke to prevent re-renders
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitContext();
      setContext(''); // Clear immediately
      inputRef.current?.blur();
    }
  };

  const submitContext = () => {
    if (context.trim()) { // Only submit if not empty
      if (data.onContextSubmit) {
        data.onContextSubmit(context);
      } else if (data.onContextChange) {
        data.onContextChange(context);
      }
    }
  };

  const handleSubmitClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    submitContext();
    setContext(''); // Clear immediately
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (data.onDelete) {
      data.onDelete();
    }
  };

  return React.createElement(
    'div',
    {
      style: {
        position: 'relative',
        padding: '16px',
        borderRadius: '12px',
        border: `2px solid ${statusColors[data.status]}`,
        background: 'white',
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
    !data.isRoot && React.createElement(Handle, { type: 'target', position: Position.Top, style: { background: '#999' } }),
    
    // Controls at the top when selected
    data.isSelected && React.createElement(
      'div',
      {
        style: {
          position: 'absolute',
          top: '-45px',
          left: '0',
          right: '0',
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
          background: 'white',
          padding: '8px',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          zIndex: 1000,
        },
        onClick: (e: React.MouseEvent) => e.stopPropagation(),
      },
      React.createElement('input', {
        ref: inputRef,
        type: 'text',
        placeholder: 'Add context...',
        value: context,
        onChange: handleContextChange,
        onKeyDown: handleKeyDown,
        style: {
          flex: 1,
          padding: '6px 10px',
          border: '1px solid #d1d5db',
          borderRadius: '6px',
          fontSize: '14px',
          outline: 'none',
        },
      }),
      React.createElement(
        'button',
        {
          onClick: handleSubmitClick,
          style: {
            padding: '6px 10px',
            background: '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 500,
          },
        },
        '✓'
      ),
      React.createElement(
        'button',
        {
          onClick: handleDelete,
          style: {
            padding: '6px 10px',
            background: '#ef4444',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 500,
          },
        },
        '🗑️'
      )
    ),
    
    React.createElement('p', { style: { fontWeight: 500, color: 'black', marginBottom: '8px' } }, data.title),
    React.createElement('p', { style: { fontSize: '14px', color: '#6b7280' } }, data.status),
    
    // Display only the latest submitted context
    data.submittedContexts && data.submittedContexts.length > 0 && React.createElement('p', { 
      style: { 
        fontSize: '12px', 
        color: '#3b82f6', 
        marginTop: '8px',
        padding: '4px 8px',
        background: '#eff6ff',
        borderRadius: '4px',
        fontWeight: 500,
        width: '100%',
        textAlign: 'center'
      } 
    }, `Context: ${data.submittedContexts[data.submittedContexts.length - 1]}`),
    
    React.createElement(Handle, { type: 'source', position: Position.Bottom, style: { background: '#999' } })
  );
});

AgentNode.displayName = 'AgentNode';
