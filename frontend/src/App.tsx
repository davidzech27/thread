import {
	Component,
	createSignal,
	createMemo,
	onMount,
	onCleanup,
	createEffect,
} from "solid-js";
import { ReactFlowWrapper } from "./components/ReactFlowWrapper";
import { BrowserModal } from "./components/BrowserModal";
import { Node as FlowNode, Edge, MarkerType } from "@xyflow/react";
import { Node } from "./types/Node";
import React from "react";
import { createRoot } from "react-dom/client";

const App: Component = () => {
	const [nodes, setNodes] = createSignal<Node[]>([]);
	const [masterPrompt, setMasterPrompt] = createSignal<string>("");
	const [ws, setWs] = createSignal<WebSocket | null>(null);
	const [isConnected, setIsConnected] = createSignal(false);
	const [modalOpen, setModalOpen] = createSignal(false);
	const [modalTitle, setModalTitle] = createSignal("");
	const [browserFrameData, setBrowserFrameData] = createSignal<string | null>(null);
	const [browserMetadata, setBrowserMetadata] = createSignal<{ width: number; height: number } | null>(null);

	const handleViewClick = (nodeId: string, title: string) => {
		console.log("View clicked for node:", nodeId, title);
		setModalTitle(`Browser - ${title}`);
		// Clear stale frame data when opening modal to show "Waiting for browser..."
		// This prevents showing a black/stale screen from previous sessions
		setBrowserFrameData(null);
		setBrowserMetadata(null);
		setModalOpen(true);
	};

	const handleCloseModal = () => {
		console.log("Closing modal");
		setModalOpen(false);
	};

	// WebSocket connection
	onMount(() => {
		const websocket = new WebSocket("ws://localhost:3001");

		websocket.onopen = () => {
			console.log("Connected to WebSocket server");
			setIsConnected(true);
		};

		websocket.onmessage = (event) => {
			const data = JSON.parse(event.data);
			console.log("Received:", data);

			if (data.type === "agent-state") {
				// Update or create agent node
				const agentState = data.state;
				updateAgentNode(agentState);
			} else if (data.type === "text-delta") {
				// Append text to current agent
				if (data.agentId) {
					appendTextToAgent(data.agentId, data.delta || data.textDelta || "");
				}
			} else if (data.type === "user-query") {
				// Agent is asking user for input
				const { agentId, prompt } = data;
				setAgentUserPrompt(agentId, prompt);
			} else if (data.type === "agent-completed") {
				// All agents completed
				console.log("Agent workflow completed");
				markMasterAsCompleted();
			} else if (data.type === "browser-frame") {
				// Browser frame received from backend
				setBrowserFrameData(data.data);
				setBrowserMetadata(data.metadata);
			} else if (data.type === "error") {
				console.error("Backend error:", data.error);
			}
		};

		websocket.onerror = (error) => {
			console.error("WebSocket error:", error);
			setIsConnected(false);
		};

		websocket.onclose = () => {
			console.log("Disconnected from WebSocket server");
			setIsConnected(false);
		};

		setWs(websocket);
	});

	onCleanup(() => {
		const websocket = ws();
		if (websocket) {
			websocket.close();
		}
	});

	// Update or create agent node from backend state
	const updateAgentNode = (agentState: any) => {
		const { agentId, parentId, status, result } = agentState;

		setNodes((prevNodes) => {
			// Check if node exists
			const existingNode = findNodeById(prevNodes, agentId);

			if (existingNode) {
				// Update existing node
				return updateNodeRecursive(prevNodes, agentId, {
					status,
					content: result || existingNode.content,
				});
			} else {
				// Create new node
				const newNode: Node = {
					id: agentId,
					title: `Agent ${agentId.substring(0, 8)}`,
					status: status || "running",
					parentId: parentId || undefined,
					isSelected: false,
					isExpanded: true,
					content: result || "",
					children: [],
				};

				// If it's a root node (no parent), add to top level
				if (!parentId) {
					return [...prevNodes, newNode];
				} else {
					// Add as child to parent
					return addChildToParent(prevNodes, parentId, newNode);
				}
			}
		});
	};

	// Append text to agent's content
	const appendTextToAgent = (agentId: string, text: string) => {
		setNodes((prevNodes) => {
			return updateNodeRecursive(prevNodes, agentId, (node) => ({
				...node,
				content: (node.content || "") + text,
			}));
		});
	};

	// Set user prompt for agent
	const setAgentUserPrompt = (agentId: string, prompt: string) => {
		setNodes((prevNodes) => {
			return updateNodeRecursive(prevNodes, agentId, {
				status: "awaiting_user" as const,
				userPrompt: prompt,
			});
		});
	};

	// Mark master as completed with final answer
	const markMasterAsCompleted = () => {
		// Find the root agent and mark it as final answer
		setNodes((prevNodes) => {
			if (prevNodes.length > 0) {
				const rootNode = prevNodes[0];
				return updateNodeRecursive(prevNodes, rootNode.id, {
					isFinalAnswer: true,
					status: "completed" as const,
				});
			}
			return prevNodes;
		});
	};

	// Helper functions
	const findNodeById = (nodeList: Node[], id: string): Node | null => {
		for (const node of nodeList) {
			if (node.id === id) return node;
			if (node.children) {
				const found = findNodeById(node.children, id);
				if (found) return found;
			}
		}
		return null;
	};

	const updateNodeRecursive = (
		nodeList: Node[],
		targetId: string,
		updates: Partial<Node> | ((node: Node) => Partial<Node>)
	): Node[] => {
		return nodeList.map((node) => {
			if (node.id === targetId) {
				const updateObj =
					typeof updates === "function" ? updates(node) : updates;
				return { ...node, ...updateObj };
			}
			if (node.children) {
				return {
					...node,
					children: updateNodeRecursive(node.children, targetId, updates),
				};
			}
			return node;
		});
	};

	const addChildToParent = (
		nodeList: Node[],
		parentId: string,
		child: Node
	): Node[] => {
		return nodeList.map((node) => {
			if (node.id === parentId) {
				const children = node.children || [];
				return { ...node, children: [...children, child] };
			}
			if (node.children) {
				return {
					...node,
					children: addChildToParent(node.children, parentId, child),
				};
			}
			return node;
		});
	};

	const handleMasterSubmit = (prompt: string) => {
		console.log("Master prompt:", prompt);
		setMasterPrompt(prompt);

		// Clear existing nodes
		setNodes([]);

		// Send to backend via WebSocket
		const websocket = ws();
		if (websocket && websocket.readyState === WebSocket.OPEN) {
			websocket.send(
				JSON.stringify({
					type: "start-agent",
					prompt,
				})
			);
		} else {
			console.error("WebSocket not connected");
		}
	};

	// Handle user response to agent query
	const handleUserResponse = (agentId: string, response: string) => {
		const websocket = ws();
		if (websocket && websocket.readyState === WebSocket.OPEN) {
			websocket.send(
				JSON.stringify({
					type: "user-response",
					agentId,
					response,
				})
			);

			// Clear the user prompt
			setNodes((prevNodes) => {
				return updateNodeRecursive(prevNodes, agentId, {
					userPrompt: undefined,
					status: "running" as const,
				});
			});
		}
	};

	// Keyboard event handler for delete
	const handleKeyDown = (event: KeyboardEvent) => {
		if (event.key === "Delete") {
			const selectedNode = getSelectedNode(nodes());
			if (selectedNode) {
				event.preventDefault();
				deleteNode(selectedNode.id);
			}
		}
	};

	onMount(() => {
		window.addEventListener("keydown", handleKeyDown);
	});

	onCleanup(() => {
		window.removeEventListener("keydown", handleKeyDown);
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
				children: node.children
					? deleteNodeRecursive(node.children, targetId)
					: undefined,
			}));
	};

	// Update node context
	const updateNodeContext = (nodeId: string, context: string) => {
		// Store the context (you can process it here - send to backend, etc.)
		console.log(`Node ${nodeId} context:`, context);

		// Add to submitted contexts array and clear input field
		setNodes((prevNodes) =>
			addSubmittedContextRecursive(prevNodes, nodeId, context)
		);
	};

	const addSubmittedContextRecursive = (
		nodesList: Node[],
		targetId: string,
		context: string
	): Node[] => {
		return nodesList.map((node) => {
			if (node.id === targetId) {
				const existingContexts = node.submittedContexts || [];
				return {
					...node,
					submittedContexts: [...existingContexts, context],
					context: "", // Clear input field
				};
			}
			if (node.children) {
				return {
					...node,
					children: addSubmittedContextRecursive(
						node.children,
						targetId,
						context
					),
				};
			}
			return node;
		});
	};

	const updateNodeContextRecursive = (
		nodesList: Node[],
		targetId: string,
		context: string
	): Node[] => {
		return nodesList.map((node) => {
			if (node.id === targetId) {
				return { ...node, context };
			}
			if (node.children) {
				return {
					...node,
					children: updateNodeContextRecursive(
						node.children,
						targetId,
						context
					),
				};
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
			id: "master",
			type: "masterNode",
			position: { x: -170, y: -200 },
			data: {
				onSubmit: handleMasterSubmit,
				isConnected: isConnected(),
			},
		});

		// Calculate positions for nodes in a tree layout
		const levelWidth = 350; // horizontal spacing
		const levelHeight = 250; // vertical spacing

		const traverseTree = (
			nodeList: Node[],
			level: number = 0,
			parentX: number = 0,
			indexAtLevel: number = 0
		) => {
			nodeList.forEach((node, index) => {
				const shouldShow =
					level === 0 ||
					(node.parentId && isParentExpanded(nodes(), node.parentId));

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
					type: "agentNode",
					position: { x, y },
					data: {
						title: node.title,
						status: node.status,
						isSelected: node.isSelected,
						isRoot: !node.parentId,
						context: node.context,
						submittedContexts: node.submittedContexts,
						content: node.content,
						userPrompt: node.userPrompt,
						isFinalAnswer: node.isFinalAnswer,
						onContextSubmit: (context: string) =>
							updateNodeContext(node.id, context),
						onDelete: () => deleteNode(node.id),
						onUserResponse: (response: string) =>
							handleUserResponse(node.id, response),
						onViewClick: () => handleViewClick(node.id, node.title),
					},
				});

				// Add edge from parent
				if (node.parentId) {
					flowEdges.push({
						id: `${node.parentId}-${node.id}`,
						source: node.parentId,
						target: node.id,
						type: "smoothstep",
						animated: node.status === "running",
						markerEnd: {
							type: MarkerType.ArrowClosed,
							width: 20,
							height: 20,
							color: "#999",
						},
						style: {
							strokeWidth: 2,
							stroke: "#999",
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

		// Add edges from master node to all root nodes
		nodes().forEach((node) => {
			flowEdges.push({
				id: `master-${node.id}`,
				source: "master",
				target: node.id,
				type: "smoothstep",
				animated: false,
				markerEnd: {
					type: MarkerType.ArrowClosed,
					width: 20,
					height: 20,
					color: "#10b981",
				},
				style: {
					strokeWidth: 2,
					stroke: "#10b981",
				},
			});
		});

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
					isExpanded: newIsSelected || node.isExpanded, // Keep expanded if already expanded
					children: node.children
						? deselectAllChildren(node.children)
						: undefined,
				};
			} else if (node.children) {
				const hasSelectedChild = hasNodeInTree(node.children, targetId);
				if (hasSelectedChild) {
					// Keep this node expanded but deselect it if a child is being selected
					return {
						...node,
						isSelected: false, // Deselect parent when child is selected
						isExpanded: true, // Keep expanded to show children
						children: toggleNodeRecursive(node.children, targetId),
					};
				} else {
					// Target is in a different tree - collapse and deselect
					return {
						...node,
						isSelected: false,
						isExpanded: false, // Collapse when selecting outside tree
						children: node.children
							? collapseAllChildren(node.children)
							: undefined,
					};
				}
			} else {
				// Deselect nodes without children
				return {
					...node,
					isSelected: false,
				};
			}
		});
	};

	const collapseAllChildren = (nodesList: Node[]): Node[] => {
		return nodesList.map((node) => ({
			...node,
			isSelected: false,
			isExpanded: false,
			children: node.children ? collapseAllChildren(node.children) : undefined,
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
			children: node.children ? deselectAllChildren(node.children) : undefined,
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
			console.log("Setting up modal root");
			modalRootInstance = createRoot(modalContainer);
		}
	});

	// Re-render modal when state changes
	createEffect(() => {
		if (modalRootInstance) {
			console.log("Rendering modal with isOpen:", modalOpen());
			modalRootInstance.render(
				React.createElement(BrowserModal, {
					isOpen: modalOpen(),
					onClose: handleCloseModal,
					title: modalTitle(),
					frameData: browserFrameData(),
					metadata: browserMetadata(),
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
