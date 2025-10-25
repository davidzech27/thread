import { Component, JSX, createSignal, createEffect, children as resolveChildren } from 'solid-js';
import cn from '../lib/cn';

interface MagnifyRowProps {
  children: JSX.Element;
  maxScale?: number;
  effectDistance?: number;
  class?: string;
}

export const MagnifyRow: Component<MagnifyRowProps> = (props) => {
  const maxScale = () => props.maxScale ?? 2;
  const effectDistance = () => props.effectDistance ?? 400;

  const [mousePosition, setMousePosition] = createSignal({ x: -1000, y: -1000 });
  let containerRef: HTMLDivElement | undefined;
  let childRefs: HTMLElement[] = [];
  let originalPositions: number[] = [];
  let childWidths: number[] = [];

  const resolved = resolveChildren(() => props.children);

  // Recalculate positions when children change
  createEffect(() => {
    // Access resolved children to create dependency
    const kids = resolved();

    // Reset arrays
    childRefs = [];
    originalPositions = [];
    childWidths = [];

    // Wait for next tick to ensure DOM is updated
    setTimeout(() => {
      if (containerRef) {
        const childElements = Array.from(containerRef.children) as HTMLElement[];
        childRefs = childElements;

        childElements.forEach((el) => {
          const rect = el.getBoundingClientRect();
          originalPositions.push(rect.left + rect.width / 2);
          childWidths.push(rect.width);
        });
      }
    }, 0);
  });

  const calculateFactor = (distance: number): number => {
    const normalized = distance / effectDistance();
    if (normalized >= 1) return 0;
    // Cosine interpolation for smooth, natural feel
    return (1 + Math.cos(Math.PI * normalized)) / 2;
  };

  const calculateTransform = (index: number) => {
    const mouse = mousePosition();
    const originalX = originalPositions[index];
    const width = childWidths[index];

    if (!originalX || !width) return { scale: 1, translateX: 0 };

    // Calculate scale for all children based on distance from mouse to ORIGINAL positions
    const scales = originalPositions.map((origX) => {
      const distance = Math.abs(mouse.x - origX);
      const factor = calculateFactor(distance);
      return 1 + (maxScale() - 1) * factor;
    });

    const scale = scales[index];

    // Calculate displacement for each child's center if first child is anchored at its original position
    // Displacement = how far the child center has moved from its original position
    const displacements: number[] = [];
    for (let i = 0; i < scales.length; i++) {
      let disp = 0;
      // Add full expansion of all children to the left
      for (let j = 0; j < i; j++) {
        disp += (scales[j] - 1) * childWidths[j];
      }
      // Add half expansion of current child (its left side)
      disp += ((scales[i] - 1) * childWidths[i]) / 2;
      displacements.push(disp);
    }

    // Find the displacement at the mouse cursor position via interpolation
    // This tells us how far the pixel under the cursor has moved
    let displacementAtMouse = 0;

    const firstChildLeftEdge = originalPositions[0] - childWidths[0] / 2;
    const lastChildRightEdge =
      originalPositions[originalPositions.length - 1] +
      childWidths[childWidths.length - 1] / 2;

    if (mouse.x <= firstChildLeftEdge) {
      // Mouse is before the first child entirely - no displacement
      displacementAtMouse = 0;
    } else if (mouse.x < originalPositions[0]) {
      // Mouse is inside first child, left of its center - interpolate within it
      const offset = originalPositions[0] - mouse.x;
      displacementAtMouse = displacements[0] + offset * (1 - scales[0]);
    } else if (mouse.x >= lastChildRightEdge) {
      // Mouse is beyond the last child's right edge
      const lastIndex = originalPositions.length - 1;
      const offset = mouse.x - originalPositions[lastIndex];
      displacementAtMouse = displacements[lastIndex] + offset * (scales[lastIndex] - 1);
    } else if (mouse.x > originalPositions[originalPositions.length - 1]) {
      // Mouse is inside last child, right of its center - interpolate within it
      const lastIndex = originalPositions.length - 1;
      const offset = mouse.x - originalPositions[lastIndex];
      displacementAtMouse = displacements[lastIndex] + offset * (scales[lastIndex] - 1);
    } else {
      // Mouse is between child centers - interpolate between adjacent centers
      for (let i = 0; i < originalPositions.length - 1; i++) {
        if (mouse.x >= originalPositions[i] && mouse.x <= originalPositions[i + 1]) {
          const t =
            (mouse.x - originalPositions[i]) / (originalPositions[i + 1] - originalPositions[i]);
          displacementAtMouse = displacements[i] + t * (displacements[i + 1] - displacements[i]);
          break;
        }
      }
    }

    // Apply compensation: shift child by its natural displacement minus the displacement at cursor
    // This keeps the pixel under the cursor stationary
    const translateX = displacements[index] - displacementAtMouse;

    return { scale, translateX };
  };

  return (
    <div
      ref={containerRef}
      class={cn('flex', props.class)}
      onMouseMove={(e) => setMousePosition({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setMousePosition({ x: -1000, y: -1000 })}
    >
      {(() => {
        const kids = resolved();
        if (Array.isArray(kids)) {
          return kids.map((child, index) => {
            const transform = () => calculateTransform(index);
            return (
              <div
                style={{
                  transform: `translateX(${transform().translateX}px) scale(${transform().scale})`,
                  'transform-origin': 'center',
                  transition: 'transform 400ms cubic-bezier(0.16, 1, 0.3, 1)',
                }}
              >
                {child}
              </div>
            );
          });
        }
        // Single child case
        const transform = () => calculateTransform(0);
        return (
          <div
            style={{
              transform: `translateX(${transform().translateX}px) scale(${transform().scale})`,
              'transform-origin': 'center',
              transition: 'transform 400ms cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            {kids}
          </div>
        );
      })()}
    </div>
  );
};
