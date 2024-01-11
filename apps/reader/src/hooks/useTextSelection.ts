// https://github.com/juliankrispel/use-text-selection

import { useEventListener } from '@literal-ui/hooks'
import { useState, useEffect, useRef } from 'react'

import { isTouchScreen } from '../platform'

import { useForceRender } from './useForceRender'
import { getClickedAnnotation } from '../components'

export function hasSelection(
  selection?: Selection | null,
): selection is Selection {
  return !(!selection || selection.isCollapsed)
}

// https://htmldom.dev/get-the-direction-of-the-text-selection/
export function isForwardSelection(selection: Selection) {
  if (selection.anchorNode && selection.focusNode) {
    const range = document.createRange()
    range.setStart(selection.anchorNode, selection.anchorOffset)
    range.setEnd(selection.focusNode, selection.focusOffset)

    return !range.collapsed
  }

  return true
}

export function useTextSelection(win?: Window) {
  const [selection, setSelection] = useState<Selection | undefined>();
  const render = useForceRender();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const updateSelection = () => {
    const s = win?.getSelection();
    if (hasSelection(s)) {
      render();
      setSelection(s);
    }
  };

  // Clear timeout function
  const clearTimeoutRef = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  // Event listener for selection change with delay
  useEventListener(
    isTouchScreen ? win?.document : win,
    isTouchScreen ? 'selectionchange' : 'mouseup',
    () => {
      if (!getClickedAnnotation()) {
      clearTimeoutRef();
      timeoutRef.current = setTimeout(updateSelection, 1000); // Delay of 0.5s
      } else {
        updateSelection()
      }
    },
  );

  // Cleanup on selection change
  useEffect(() => {
    return clearTimeoutRef;
  }, [selection]);

  // Preventing context menu on touch screens
  useEventListener(win, 'contextmenu', (e) => {
    if (isTouchScreen) {
      e.preventDefault();
    }
  });

  return [selection, setSelection] as const;
}

