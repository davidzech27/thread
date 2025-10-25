export type NodeStatus = 'idle' | 'running' | 'completed' | 'error';

export type Node = {
  id: string;
  title: string;
  status: NodeStatus;
  parentId?: string;
  isSelected: boolean;
  children?: Node[];
};
