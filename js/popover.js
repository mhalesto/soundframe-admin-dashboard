// Anchored popovers (date range, notifications, profile, filter menus): positioning, outside click, Escape,
// focus in and focus return. One popover is open at a time.
import { prefersReducedMotion } from "./ui.js";

let current = null;

function position(popover, anchor, align) {
  const rect = anchor.getBoundingClientRect();
  popover.style.visibility = "hidden";
  popover.hidden = false;
  const box = popover.getBoundingClientRect();
  const margin = 8;
  let left = align === "start" ? rect.left : rect.right - box.width;
  left = Math.max(margin, Math.min(left, window.innerWidth - box.width - margin));
  let top = rect.bottom + 8;
  if (top + box.height > window.innerHeight - margin && rect.top - box.height - 8 > margin) {
    top = rect.top - box.height - 8;
  }
  popover.style.left = `${Math.round(left)}px`;
  popover.style.top = `${Math.round(Math.max(margin, top))}px`;
  popover.style.setProperty("--origin", `${align === "start" ? "top left" : "top right"}`);
  popover.style.visibility = "";
}

export function isOpen(popover) {
  return current?.popover === popover;
}

export function closePopover({ restoreFocus = true } = {}) {
  if (!current) return;
  const { popover, anchor, onClose } = current;
  current = null;
  anchor?.setAttribute("aria-expanded", "false");
  const finish = () => {
    popover.hidden = true;
    popover.classList.remove("is-closing");
  };
  if (prefersReducedMotion()) finish();
  else {
    popover.classList.add("is-closing");
    setTimeout(finish, 130);
  }
  if (restoreFocus && anchor && document.contains(anchor)) anchor.focus({ preventScroll: true });
  onClose?.();
}

export function openPopover(popover, anchor, { align = "end", focus = true, onClose } = {}) {
  if (current?.popover === popover) {
    closePopover();
    return;
  }
  closePopover({ restoreFocus: false });
  popover.classList.remove("is-closing");
  position(popover, anchor, align);
  anchor.setAttribute("aria-expanded", "true");
  current = { popover, anchor, onClose, align };
  if (focus) {
    const target = popover.querySelector('[aria-selected="true"], [role="menuitem"], [role="menuitemcheckbox"], button, input, [tabindex="0"]');
    requestAnimationFrame(() => target?.focus({ preventScroll: true }));
  }
}

export function repositionPopover() {
  if (current) position(current.popover, current.anchor, current.align);
}

export function initPopovers() {
  document.addEventListener("pointerdown", (event) => {
    if (!current) return;
    if (current.popover.contains(event.target) || current.anchor.contains(event.target)) return;
    closePopover({ restoreFocus: false });
  });
  document.addEventListener("keydown", (event) => {
    if (!current) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closePopover();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const items = Array.from(current.popover.querySelectorAll('[role="menuitem"], [role="menuitemcheckbox"], [role="option"]'))
        .filter((item) => !item.disabled && item.offsetParent !== null);
      if (items.length === 0) return;
      event.preventDefault();
      const index = items.indexOf(document.activeElement);
      const next = event.key === "ArrowDown" ? (index + 1) % items.length : (index - 1 + items.length) % items.length;
      items[next].focus();
    }
  }, true);
  window.addEventListener("resize", repositionPopover);
}
