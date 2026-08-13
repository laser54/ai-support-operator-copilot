import { X } from "lucide-react";
import { useEffect, useId, useRef, type MouseEvent, type ReactNode } from "react";

import styles from "./Dialog.module.css";

export function Dialog({
  open,
  title,
  busy = false,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  busy?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }
    ref.current?.showModal();
  }, [open]);

  if (!open) {
    return null;
  }

  function handleBackdrop(event: MouseEvent<HTMLDialogElement>) {
    if (busy || event.target !== event.currentTarget) {
      return;
    }
    onClose();
  }

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) {
          onClose();
        }
      }}
      onClick={handleBackdrop}
    >
      <div className={styles.header}>
        <h2 className={styles.title} id={titleId}>
          {title}
        </h2>
        {busy ? null : (
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close dialog">
            <X aria-hidden size={18} />
          </button>
        )}
      </div>
      <div className={styles.body}>{children}</div>
    </dialog>
  );
}
