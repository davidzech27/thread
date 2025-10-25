import { Component, For } from 'solid-js';
import { MagnifyRow } from './components/MagnifyRow';
import { Card } from './components/Card';

const App: Component = () => {
  const cards = [1, 2, 3, 4];

  return (
    <div class="w-screen h-screen flex items-center justify-center bg-white">
      <MagnifyRow maxScale={2} effectDistance={400} class="gap-8">
        <For each={cards}>
          {(card) => (
            <Card class="p-4 w-64 h-[170px]">
              <p class="text-black font-medium">hello</p>
              <p class="text-gray-500">world!</p>
            </Card>
          )}
        </For>
      </MagnifyRow>
    </div>
  );
};

export default App;
