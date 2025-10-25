export type NodeStatus = 'idle' | 'running' | 'completed' | 'error';

export type Node = {
  id: string;
  title: string;
  status: NodeStatus;
  parentId?: string;
  isSelected: boolean;
  isExpanded?: boolean; // tracks if children should be visible
  context?: string; // Current input context
  submittedContexts?: string[]; // Array of submitted contexts
  children?: Node[];
};
