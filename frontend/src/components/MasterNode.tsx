import React, { memo, useState, useRef } from 'react';
import { Handle, Position } from '@xyflow/react';

interface MasterNodeData {
  onSubmit?: (prompt: string) => void;
}

export const MasterNode = memo(({ data }: { data: MasterNodeData }) => {
  const [prompt, setPrompt] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (prompt.trim() && data.onSubmit) {
      data.onSubmit(prompt);
      setPrompt('');
      inputRef.current?.blur();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return React.createElement(
    'div',
    {
      style: {
        position: 'relative',
        width: '600px',
        padding: '0',
      },
    },
    React.createElement(
      'div',
      {
        style: {
          display: 'flex',
          alignItems: 'center',
          background: 'white',
          border: '1px solid #d1d5db',
          borderRadius: '24px',
          padding: '12px 20px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
          transition: 'all 0.2s',
        },
        onMouseEnter: (e: React.MouseEvent<HTMLDivElement>) => {
          e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.12)';
          e.currentTarget.style.borderColor = '#9ca3af';
        },
        onMouseLeave: (e: React.MouseEvent<HTMLDivElement>) => {
          e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)';
          e.currentTarget.style.borderColor = '#d1d5db';
        },
      },
      React.createElement('input', {
        ref: inputRef,
        type: 'text',
        placeholder: 'Message AI Agent...',
        value: prompt,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setPrompt(e.target.value),
        onKeyDown: handleKeyDown,
        style: {
          flex: 1,
          border: 'none',
          outline: 'none',
          fontSize: '16px',
          background: 'transparent',
          color: '#1f2937',
        },
      }),
      React.createElement(
        'button',
        {
          onClick: () => handleSubmit(),
          disabled: !prompt.trim(),
          style: {
            background: prompt.trim() ? '#10b981' : '#d1d5db',
            color: 'white',
            border: 'none',
            borderRadius: '12px',
            padding: '8px 16px',
            cursor: prompt.trim() ? 'pointer' : 'not-allowed',
            fontSize: '14px',
            fontWeight: 600,
            transition: 'all 0.2s',
            marginLeft: '12px',
          },
          onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => {
            if (prompt.trim()) {
              e.currentTarget.style.background = '#059669';
            }
          },
          onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => {
            if (prompt.trim()) {
              e.currentTarget.style.background = '#10b981';
            }
          },
        },
        '→'
      )
    )
  );
});

MasterNode.displayName = 'MasterNode';
