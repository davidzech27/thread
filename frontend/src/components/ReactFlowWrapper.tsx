import { onMount, onCleanup, createEffect } from 'solid-js';
import React, { useState, useCallback, useEffect } from 'react';
import { ReactFlow, Background, Controls, Node as FlowNode, Edge, useNodesState, useEdgesState } from '@xyflow/react';
import { createRoot } from 'react-dom/client';
import { AgentNode } from './AgentNode';
import { MasterNode } from './MasterNode';
import '@xyflow/react/dist/style.css';

interface ReactFlowWrapperProps {
  nodes: FlowNode[];
  edges: Edge[];
  onNodeClick?: (event: any, node: FlowNode) => void;
}

const nodeTypes = {
  agentNode: AgentNode,
  masterNode: MasterNode,
};

// Create a React component that properly manages state
const ReactFlowComponent = ({ 
  initialNodes, 
  initialEdges, 
  onNodeClick 
}: { 
  initialNodes: FlowNode[], 
  initialEdges: Edge[], 
  onNodeClick?: (event: any, node: FlowNode) => void 
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Update nodes and edges when props change
  useEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes, setNodes]);

  useEffect(() => {
    setEdges(initialEdges);
  }, [initialEdges, setEdges]);

  return React.createElement(
    ReactFlow,
    {
      nodes,
      edges,
      onNodesChange,
      onEdgesChange,
      onNodeClick,
      nodeTypes,
      fitView: true,
      attributionPosition: 'bottom-right',
      nodesDraggable: false,
      nodesConnectable: false,
      elementsSelectable: false,
      zoomOnDoubleClick: false,
    },
    React.createElement(Background),
    React.createElement(Controls)
  );
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
      React.createElement(ReactFlowComponent, {
        initialNodes: props.nodes,
        initialEdges: props.edges,
        onNodeClick: props.onNodeClick,
      })
    );
  };

  onCleanup(() => {
    if (root) {
      root.unmount();
    }
  });

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
};
