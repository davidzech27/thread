export type NodeStatus = 'idle' | 'running' | 'completed' | 'error' | 'awaiting_user';

export type Node = {
  id: string;
  title: string;
  status: NodeStatus;
  parentId?: string;
  isSelected: boolean;
  isExpanded?: boolean; // tracks if children should be visible
  context?: string; // Current input context
  submittedContexts?: string[]; // Array of submitted contexts
  content?: string; // The text/result content from the agent
  userPrompt?: string; // The prompt that user is being asked (when awaiting_user)
  isFinalAnswer?: boolean; // True if this is the master agent's final answer
  children?: Node[];
};

