import { act, render, waitFor } from '@testing-library/react';
import { type FC } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MESSAGE_ACTION_BAR_PORTAL_ATTRIBUTES } from '@/const/messageActionPortal';

import {
  type MessageActionType,
  useSetMessageItemActionElementPortialContext,
  useSetMessageItemActionTypeContext,
} from './message-action-context';
import { MessageActionProvider } from './MessageActionProvider';

vi.mock('../../store', () => ({
  dataSelectors: {
    getDisplayMessageById: () => () => null,
    getGroupLatestMessageWithoutTools: () => () => null,
  },
  useConversationStore: vi.fn((selector: unknown) =>
    typeof selector === 'function'
      ? (selector as (s: unknown) => unknown)({ actionsBar: {} })
      : null,
  ),
}));

vi.mock('../Assistant/Actions', () => ({ AssistantActionsBar: () => null }));
vi.mock('../User/Actions', () => ({ UserActionsBar: () => null }));
vi.mock('../AssistantGroup/Actions', () => ({ GroupActionsBar: () => null }));

const HOST_SELECTOR = '[data-singleton-message-action-bar-host]';

/** Creates a container with an inner portal placeholder matching the given type. */
const createPortalContainer = (type: 'assistant' | 'assistantGroup' | 'user') => {
  const container = document.createElement('div');
  const placeholder = document.createElement('div');
  placeholder.setAttribute(MESSAGE_ACTION_BAR_PORTAL_ATTRIBUTES[type], '');
  container.appendChild(placeholder);
  document.body.appendChild(container);
  return { container, placeholder };
};

/**
 * Child component that captures the MessageActionProvider context setters so the
 * test can simulate hovering different messages imperatively.
 */
let setPortal: (el: HTMLDivElement | null) => void;
let setActionType: (at: MessageActionType | null) => void;

const ContextController: FC = () => {
  setPortal = useSetMessageItemActionElementPortialContext();
  setActionType = useSetMessageItemActionTypeContext();
  return null;
};

describe('SingletonMessageActionsBar – popup freeze regression (15cb3be9)', () => {
  const containers: HTMLElement[] = [];

  const tracked = (type: 'assistant' | 'assistantGroup' | 'user') => {
    const result = createPortalContainer(type);
    containers.push(result.container);
    return result;
  };

  afterEach(() => {
    for (const el of containers) el.remove();
    containers.length = 0;
    for (const el of document.querySelectorAll(HOST_SELECTOR)) el.remove();
  });

  it('moves host to the new portal when no popup is open', async () => {
    const { container: containerA, placeholder: placeholderA } = tracked('assistant');
    const { container: containerB, placeholder: placeholderB } = tracked('assistant');

    render(
      <MessageActionProvider withSingletonActionsBar>
        <ContextController />
      </MessageActionProvider>,
    );

    await act(async () => {
      setPortal(containerA);
      setActionType({ id: 'msg-a', index: 0, type: 'assistant' });
    });

    const host = document.querySelector(HOST_SELECTOR) as HTMLElement;
    expect(host).toBeTruthy();
    await waitFor(() => expect(placeholderA.contains(host)).toBe(true));

    await act(async () => {
      setPortal(containerB);
      setActionType({ id: 'msg-b', index: 0, type: 'assistant' });
    });

    await waitFor(() => expect(placeholderB.contains(host)).toBe(true));
  });

  it('freezes host placement while a popup is open and unfreezes on close', async () => {
    const { container: containerA, placeholder: placeholderA } = tracked('assistant');
    const { container: containerB, placeholder: placeholderB } = tracked('assistant');

    render(
      <MessageActionProvider withSingletonActionsBar>
        <ContextController />
      </MessageActionProvider>,
    );

    // Hover message A – host should move into A's placeholder
    await act(async () => {
      setPortal(containerA);
      setActionType({ id: 'msg-a', index: 0, type: 'assistant' });
    });

    const host = document.querySelector(HOST_SELECTOR) as HTMLElement;
    await waitFor(() => expect(placeholderA.contains(host)).toBe(true));

    // Simulate a dropdown / popup opening inside the action bar host
    const popupTrigger = document.createElement('div');
    popupTrigger.setAttribute('data-popup-open', '');
    host.appendChild(popupTrigger);

    // Hover message B while the popup is still open
    await act(async () => {
      setPortal(containerB);
      setActionType({ id: 'msg-b', index: 0, type: 'assistant' });
    });

    // Before the fix the host would have moved to B, closing the open popup.
    // With the fix the host stays frozen at A.
    expect(placeholderA.contains(host)).toBe(true);
    expect(placeholderB.contains(host)).toBe(false);

    // Close the popup – the freeze should lift and the host should catch up to B
    await act(async () => {
      popupTrigger.removeAttribute('data-popup-open');
    });

    await waitFor(() => expect(placeholderB.contains(host)).toBe(true));
  });
});
