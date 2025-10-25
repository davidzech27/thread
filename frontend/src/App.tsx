import { Component, createSignal, createMemo, onMount, onCleanup, createEffect } from 'solid-js';
import { ReactFlowWrapper } from './components/ReactFlowWrapper';
import { BrowserModal } from './components/BrowserModal';
import { Node as FlowNode, Edge, MarkerType } from '@xyflow/react';
import { Node } from './types/Node';
import React from 'react';
import { createRoot } from 'react-dom/client';

const mockData: Node[] = [
  {
    id: '1',
    title: 'Data Processing Agent',
    status: 'running',
    isSelected: false,
    children: [
      {
        id: '1-1',
        title: 'Parse CSV Files',
        status: 'completed',
        parentId: '1',
        isSelected: false,
        children: [
          {
            id: '1-1-1',
            title: 'Validate Headers',
            status: 'completed',
            parentId: '1-1',
            isSelected: false,
          },
          {
            id: '1-1-2',
            title: 'Check Data Types',
            status: 'running',
            parentId: '1-1',
            isSelected: false,
          },
        ],
      },
      {
        id: '1-2',
        title: 'Transform Data',
        status: 'running',
        parentId: '1',
        isSelected: false,
      },
    ],
  },
  {
    id: '2',
    title: 'API Integration Agent',
    status: 'idle',
    isSelected: false,
    children: [
      {
        id: '2-1',
        title: 'Fetch External Data',
        status: 'idle',
        parentId: '2',
        isSelected: false,
      },
    ],
  },
  {
    id: '3',
    title: 'Report Generation Agent',
    status: 'completed',
    isSelected: false,
  },
];

const App: Component = () => {
  const [nodes, setNodes] = createSignal<Node[]>(mockData);
  const [masterPrompt, setMasterPrompt] = createSignal<string>('');
  const [modalOpen, setModalOpen] = createSignal(false);
  const [modalTitle, setModalTitle] = createSignal('');

  const handleMasterSubmit = (prompt: string) => {
    console.log('Master prompt:', prompt);
    setMasterPrompt(prompt);
    // TODO: Send to backend to process and create agent nodes
  };

  const handleViewClick = (nodeId: string, title: string) => {
    console.log('View clicked for node:', nodeId, title);
    setModalTitle(title);
    setModalOpen(true);
    console.log('Modal state:', modalOpen());
  };

  const handleCloseModal = () => {
    console.log('Closing modal');
    setModalOpen(false);
  };

  // Keyboard event handler for delete
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Delete') {
      const selectedNode = getSelectedNode(nodes());
      if (selectedNode) {
        event.preventDefault();
        deleteNode(selectedNode.id);
      }
    }
  };

  onMount(() => {
    window.addEventListener('keydown', handleKeyDown);
  });

  onCleanup(() => {
    window.removeEventListener('keydown', handleKeyDown);
  });

  // Get the currently selected node
  const getSelectedNode = (nodesList: Node[]): Node | null => {
    for (const node of nodesList) {
      if (node.isSelected) return node;
      if (node.children) {
        const selected = getSelectedNode(node.children);
        if (selected) return selected;
      }
    }
    return null;
  };

  // Delete a node by ID
  const deleteNode = (nodeId: string) => {
    setNodes((prevNodes) => deleteNodeRecursive(prevNodes, nodeId));
  };

  const deleteNodeRecursive = (nodesList: Node[], targetId: string): Node[] => {
    return nodesList
      .filter((node) => node.id !== targetId)
      .map((node) => ({
        ...node,
        children: node.children ? deleteNodeRecursive(node.children, targetId) : undefined,
      }));
  };

  // Update node context
  const updateNodeContext = (nodeId: string, context: string) => {
    // Store the context (you can process it here - send to backend, etc.)
    console.log(`Node ${nodeId} context:`, context);
    
    // Add to submitted contexts array and clear input field
    setNodes((prevNodes) => addSubmittedContextRecursive(prevNodes, nodeId, context));
  };

  const addSubmittedContextRecursive = (nodesList: Node[], targetId: string, context: string): Node[] => {
    return nodesList.map((node) => {
      if (node.id === targetId) {
        const existingContexts = node.submittedContexts || [];
        return { 
          ...node, 
          submittedContexts: [...existingContexts, context],
          context: '' // Clear input field
        };
      }
      if (node.children) {
        return { ...node, children: addSubmittedContextRecursive(node.children, targetId, context) };
      }
      return node;
    });
  };

  const updateNodeContextRecursive = (nodesList: Node[], targetId: string, context: string): Node[] => {
    return nodesList.map((node) => {
      if (node.id === targetId) {
        return { ...node, context };
      }
      if (node.children) {
        return { ...node, children: updateNodeContextRecursive(node.children, targetId, context) };
      }
      return node;
    });
  };

  // Convert our tree structure to React Flow nodes and edges
  const flowData = createMemo(() => {
    const flowNodes: FlowNode[] = [];
    const flowEdges: Edge[] = [];
    
    // Add master node at the top
    flowNodes.push({
      id: 'master',
      type: 'masterNode',
      position: { x: -170, y: -200 },
      data: {
        onSubmit: handleMasterSubmit,
      },
    });
    
    // Calculate positions for nodes in a tree layout
    const levelWidth = 350; // horizontal spacing
    const levelHeight = 250; // vertical spacing
    
    const traverseTree = (nodeList: Node[], level: number = 0, parentX: number = 0, indexAtLevel: number = 0) => {
      nodeList.forEach((node, index) => {
        const shouldShow = level === 0 || (node.parentId && isParentExpanded(nodes(), node.parentId));
        
        if (!shouldShow) return;
        
        // Calculate position
        const siblingsCount = nodeList.length;
        const totalWidth = (siblingsCount - 1) * levelWidth;
        const startX = parentX - totalWidth / 2;
        const x = startX + index * levelWidth;
        const y = level * levelHeight;
        
        // Add flow node
        flowNodes.push({
          id: node.id,
          type: 'agentNode',
          position: { x, y },
          data: {
            title: node.title,
            status: node.status,
            isSelected: node.isSelected,
            isRoot: !node.parentId,
            context: node.context,
            submittedContexts: node.submittedContexts,
            onContextSubmit: (context: string) => updateNodeContext(node.id, context),
            onDelete: () => deleteNode(node.id),
            onViewClick: () => handleViewClick(node.id, node.title),
          },
        });
        
        // Add edge from parent
        if (node.parentId) {
          flowEdges.push({
            id: `${node.parentId}-${node.id}`,
            source: node.parentId,
            target: node.id,
            type: 'smoothstep',
            animated: node.status === 'running',
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 20,
              height: 20,
              color: '#999',
            },
            style: {
              strokeWidth: 2,
              stroke: '#999',
            },
          });
        }
        
        // Traverse children if node is expanded
        if (node.isExpanded && node.children) {
          traverseTree(node.children, level + 1, x, index);
        }
      });
    };
    
    traverseTree(nodes());
    
    return { nodes: flowNodes, edges: flowEdges };
  });

  const isParentExpanded = (nodeList: Node[], parentId: string): boolean => {
    for (const node of nodeList) {
      if (node.id === parentId && node.isExpanded) {
        return true;
      }
      if (node.children && isParentExpanded(node.children, parentId)) {
        return true;
      }
    }
    return false;
  };

  const isParentSelected = (nodeList: Node[], parentId: string): boolean => {
    for (const node of nodeList) {
      if (node.id === parentId && node.isSelected) {
        return true;
      }
      if (node.children && isParentSelected(node.children, parentId)) {
        return true;
      }
    }
    return false;
  };

  const toggleNode = (nodeId: string) => {
    setNodes((prevNodes) => toggleNodeRecursive(prevNodes, nodeId));
  };

  const toggleNodeRecursive = (nodesList: Node[], targetId: string): Node[] => {
    return nodesList.map((node) => {
      if (node.id === targetId) {
        // Toggle this node's selection and expansion
        const newIsSelected = !node.isSelected;
        return { 
          ...node, 
          isSelected: newIsSelected,
          isExpanded: newIsSelected, // Collapse if deselected, expand if selected
          children: node.children ? (newIsSelected ? deselectAllChildren(node.children) : collapseAllChildren(node.children)) : undefined
        };
      } else if (node.children) {
        const hasSelectedChild = hasNodeInTree(node.children, targetId);
        if (hasSelectedChild) {
          // Keep this node expanded but deselect it if a child is being selected
          return {
            ...node,
            isSelected: false, // Deselect parent when child is selected
            isExpanded: true, // Keep expanded to show children
            children: toggleNodeRecursive(node.children, targetId)
          };
        } else {
          // Target is in a different tree - collapse and deselect
          return { 
            ...node, 
            isSelected: false,
            isExpanded: false, // Collapse when selecting outside tree
            children: node.children ? collapseAllChildren(node.children) : undefined
          };
        }
      } else {
        // Deselect nodes without children
        return { 
          ...node, 
          isSelected: false
        };
      }
    });
  };

  const collapseAllChildren = (nodesList: Node[]): Node[] => {
    return nodesList.map((node) => ({
      ...node,
      isSelected: false,
      isExpanded: false,
      children: node.children ? collapseAllChildren(node.children) : undefined
    }));
  };

  const hasNodeInTree = (nodesList: Node[], targetId: string): boolean => {
    return nodesList.some((node) => {
      if (node.id === targetId) return true;
      if (node.children) return hasNodeInTree(node.children, targetId);
      return false;
    });
  };

  const deselectAllChildren = (nodesList: Node[]): Node[] => {
    return nodesList.map((node) => ({
      ...node,
      isSelected: false,
      children: node.children ? deselectAllChildren(node.children) : undefined
    }));
  };

  const handleNodeClick = (event: any, flowNode: FlowNode) => {
    toggleNode(flowNode.id);
  };

  // Create a ref for the modal container
  let modalContainer: HTMLDivElement | undefined;
  let modalRootInstance: any = null;

  onMount(() => {
    if (modalContainer) {
      console.log('Setting up modal root');
      modalRootInstance = createRoot(modalContainer);
    }
  });

  // Re-render modal when state changes
  createEffect(() => {
    if (modalRootInstance) {
      console.log('Rendering modal with isOpen:', modalOpen());
      modalRootInstance.render(
        React.createElement(BrowserModal, {
          isOpen: modalOpen(),
          onClose: handleCloseModal,
          title: modalTitle(),
        })
      );
    }
  });

  onCleanup(() => {
    if (modalRootInstance) {
      modalRootInstance.unmount();
    }
  });

  return (
    <div class="w-screen h-screen bg-white">
      <ReactFlowWrapper
        nodes={flowData().nodes}
        edges={flowData().edges}
        onNodeClick={handleNodeClick}
      />
      <div ref={modalContainer!} />
    </div>
  );
};

export default App;
