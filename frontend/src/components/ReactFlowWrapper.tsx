import { onMount, onCleanup, createEffect } from 'solid-js';
import React from 'react';
import { ReactFlow, Background, Controls, Node as FlowNode, Edge, MarkerType } from '@xyflow/react';
import { createRoot } from 'react-dom/client';
import { AgentNode } from './AgentNode';
import '@xyflow/react/dist/style.css';

interface ReactFlowWrapperProps {
  nodes: FlowNode[];
  edges: Edge[];
  onNodeClick?: (event: any, node: FlowNode) => void;
}

const nodeTypes = {
  agentNode: AgentNode,
};

export const ReactFlowWrapper = (props: ReactFlowWrapperProps) => {
  let containerRef: HTMLDivElement | undefined;
  let root: any;

  onMount(() => {
    if (containerRef) {
      root = createRoot(containerRef);
      renderReactFlow();
    }
  });

  createEffect(() => {
    if (root) {
      renderReactFlow();
    }
  });

  const renderReactFlow = () => {
    if (!root) return;

    root.render(
      React.createElement(ReactFlow, {
        nodes: props.nodes,
        edges: props.edges,
        onNodeClick: props.onNodeClick,
        nodeTypes: nodeTypes,
        fitView: true,
        attributionPosition: 'bottom-right',
      },
      React.createElement(Background),
      React.createElement(Controls)
      )
    );
  };

  onCleanup(() => {
    if (root) {
      root.unmount();
    }
  });

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
};
