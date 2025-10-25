import { Component, createSignal, createMemo } from 'solid-js';
import { ReactFlowWrapper } from './components/ReactFlowWrapper';
import { Node as FlowNode, Edge, MarkerType } from '@xyflow/react';
import { Node } from './types/Node';

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

  // Convert our tree structure to React Flow nodes and edges
  const flowData = createMemo(() => {
    const flowNodes: FlowNode[] = [];
    const flowEdges: Edge[] = [];
    
    // Calculate positions for nodes in a tree layout
    const levelWidth = 350; // horizontal spacing
    const levelHeight = 250; // vertical spacing
    
    const traverseTree = (nodeList: Node[], level: number = 0, parentX: number = 0, indexAtLevel: number = 0) => {
      nodeList.forEach((node, index) => {
        const shouldShow = level === 0 || (node.parentId && isParentSelected(nodes(), node.parentId));
        
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
        
        // Traverse children if node is selected
        if (node.isSelected && node.children) {
          traverseTree(node.children, level + 1, x, index);
        }
      });
    };
    
    traverseTree(nodes());
    
    return { nodes: flowNodes, edges: flowEdges };
  });

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
        return { 
          ...node, 
          isSelected: !node.isSelected,
          children: node.children ? deselectAllChildren(node.children) : undefined
        };
      } else if (node.children) {
        const hasSelectedChild = hasNodeInTree(node.children, targetId);
        if (hasSelectedChild) {
          return {
            ...node,
            children: toggleNodeRecursive(node.children, targetId)
          };
        } else {
          return { 
            ...node, 
            isSelected: false,
            children: toggleNodeRecursive(node.children, targetId)
          };
        }
      } else {
        return { 
          ...node, 
          isSelected: false
        };
      }
    });
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

  return (
    <div class="w-screen h-screen bg-white">
      <ReactFlowWrapper
        nodes={flowData().nodes}
        edges={flowData().edges}
        onNodeClick={handleNodeClick}
      />
    </div>
  );
};

export default App;
