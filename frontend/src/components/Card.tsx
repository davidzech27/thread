import { Component, JSX } from 'solid-js';
import cn from '../lib/cn';
import { NodeStatus } from '../types/Node';

interface CardProps {
  children: JSX.Element;
  class?: string;
  onClick?: () => void;
  status?: NodeStatus;
  id?: string;
  isSelected?: boolean;
}

const statusColors: Record<NodeStatus, string> = {
  idle: 'border-gray-300',
  running: 'border-blue-500',
  completed: 'border-green-500',
  error: 'border-red-500',
};

export const Card: Component<CardProps> = (props) => {
  return (
    <div
      id={props.id}
      class={cn(
        'border-[0.5px] shadow-md rounded-xl flex flex-col items-center justify-center cursor-pointer transition-colors',
        props.isSelected ? 'bg-red-200' : 'bg-white',
        props.status ? statusColors[props.status] : 'border-[#BBB]',
        props.class
      )}
      onClick={props.onClick}
    >
      {props.children}
    </div>
  );
};
