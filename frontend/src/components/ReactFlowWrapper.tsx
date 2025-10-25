import { onMount, onCleanup, createEffect } from 'solid-js';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { ReactFlow, Background, Controls, Node as FlowNode, Edge, useNodesState, useEdgesState, useReactFlow, ReactFlowProvider } from '@xyflow/react';
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

// Inner component that has access to useReactFlow
const ReactFlowInner = ({ 
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
  const { fitView } = useReactFlow();
  const prevNodeCount = useRef(initialNodes.length);

  // Update nodes and edges when props change
  useEffect(() => {
    setNodes(initialNodes);
    
    // Check if nodes count changed (expansion or contraction)
    if (initialNodes.length !== prevNodeCount.current) {
      // Fit view with animation when nodes appear or disappear
      setTimeout(() => {
        fitView({ 
          duration: 800, // 800ms animation
          padding: 0.2, // 20% padding around nodes
        });
      }, 50); // Small delay to ensure nodes are rendered
    }
    
    prevNodeCount.current = initialNodes.length;
  }, [initialNodes, setNodes, fitView]);

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
      minZoom: 0.1,
      maxZoom: 2,
    },
    React.createElement(Background),
    React.createElement(Controls)
  );
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
  return React.createElement(
    ReactFlowProvider,
    null,
    React.createElement(ReactFlowInner, {
      initialNodes,
      initialEdges,
      onNodeClick,
    })
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
