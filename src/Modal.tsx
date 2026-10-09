import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

// Native modal dialogs keep the background inert; the Tab loop also prevents browser-chrome focus.
export default function Modal({ title, closeLabel, className = '', onClose, children }: {
  title: string; closeLabel: string; className?: string; onClose: () => void; children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  function cycleFocus(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== 'Tab') return;
    const element = event.currentTarget;
    const focusable = Array.from(element.querySelectorAll<HTMLElement>(
      'a[href], area[href], button, input, select, textarea, iframe, object, embed, summary, audio[controls], video[controls], [tabindex], [contenteditable]',
    )).filter((target) => {
      const editable = target.isContentEditable && !target.hasAttribute('tabindex');
      if ((!editable && target.tabIndex < 0) || target.matches(':disabled') || target.closest('[hidden], [inert], [aria-hidden="true"]') || !target.getClientRects().length) return false;
      const style = window.getComputedStyle(target);
      return style.visibility !== 'hidden' && style.visibility !== 'collapse';
    }).sort((first, second) => {
      // Positive tabindex values precede ordinary controls, matching sequential focus order.
      const firstOrder = first.tabIndex > 0 ? first.tabIndex : Infinity;
      const secondOrder = second.tabIndex > 0 ? second.tabIndex : Infinity;
      return firstOrder === secondOrder ? 0 : firstOrder - secondOrder;
    });
    event.preventDefault();
    if (!focusable.length) { element.focus(); return; }
    const current = focusable.findIndex((target) => target === document.activeElement);
    const next = current < 0 ? event.shiftKey ? focusable.length - 1 : 0
      : (current + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length;
    focusable[next].focus();
  }
  useEffect(() => {
    const previous = document.activeElement;
    const element = dialog.current;
    element?.showModal();
    return () => {
      element?.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  return <dialog ref={dialog} tabIndex={-1} className={`modal ${className}`} aria-labelledby={titleId} onKeyDownCapture={cycleFocus}
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="modal-inner">
      <header className="page-heading"><h2 id={titleId}>{title}</h2><button type="button" className="secondary" onClick={onClose}>{closeLabel}</button></header>
      {children}
    </div>
  </dialog>;
}
