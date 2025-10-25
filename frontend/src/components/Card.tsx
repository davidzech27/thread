import { Component, JSX } from 'solid-js';
import cn from '../lib/cn';

interface CardProps {
  children: JSX.Element;
  class?: string;
}

export const Card: Component<CardProps> = (props) => {
  return (
    <div
      class={cn(
        'bg-white border-[0.5px] border-[#BBB] shadow-md rounded-xl flex flex-col items-center justify-center',
        props.class
      )}
    >
      {props.children}
    </div>
  );
};
