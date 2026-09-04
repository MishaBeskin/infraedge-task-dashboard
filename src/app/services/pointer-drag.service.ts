import { Injectable, inject, signal, computed } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Status } from '../models/task.model';

/**
 * Callbacks a KanbanColumnComponent registers so the shared drag can drive its
 * highlight / insertion indicator and fire its `taskDropped` output — without the
 * card that started the drag needing a direct reference to sibling columns.
 */
export interface ColumnDragHandle {
  status: Status;
  /** The column root element: carries `[data-status]` and holds `.card-slot` children. */
  element: HTMLElement;
  setDragOver(active: boolean): void;
  setDropIndex(index: number | null): void;
  emitDrop(taskId: string, targetIndex: number): void;
}

/**
 * Touch/pen drag-and-drop for the board, built on Pointer Events.
 *
 * Native HTML5 drag events (`dragstart`/`dragover`/`drop`) never fire on touch
 * devices, so on a phone the HTML5 path in `task-card` / `kanban-column` can't
 * move a card at all. This service is the coarse-pointer counterpart: a card
 * calls `start()` on a press, feeds `moveTo()` viewport coordinates on every
 * `pointermove`, and calls `drop()` (or `cancel()`) on `pointerup`.
 *
 * It reuses the existing plumbing: the same per-column `dropIndex` insertion
 * line, the same `isDragOver` highlight, and the same
 * `taskDropped` / `TaskDropEvent` output the board already handles via
 * `TaskService.reorderColumn`.
 */
@Injectable({ providedIn: 'root' })
export class PointerDragService {
  private doc = inject(DOCUMENT);
  private handles = new Map<Status, ColumnDragHandle>();

  /** Id of the task being dragged with a pointer, or null when idle. */
  readonly draggingId = signal<string | null>(null);
  readonly isDragging = computed(() => this.draggingId() !== null);

  /** Resolved drop location from the most recent `moveTo()`. */
  private targetLocation: { status: Status; index: number } | null = null;

  register(handle: ColumnDragHandle): void {
    this.handles.set(handle.status, handle);
  }

  unregister(status: Status): void {
    this.handles.delete(status);
  }

  start(taskId: string): void {
    this.draggingId.set(taskId);
    this.targetLocation = null;
  }

  /**
   * Update hover state from a viewport point (used with `elementFromPoint` so it
   * works even when the columns are stacked vertically on mobile). Highlights the
   * column under the point, positions its insertion line, and clears every other
   * column. Returns the resolved `{ status, index }` or null.
   */
  moveTo(clientX: number, clientY: number): { status: Status; index: number } | null {
    if (!this.isDragging()) return null;

    const columnEl = this.columnElementAt(clientX, clientY);
    const status = (columnEl?.getAttribute('data-status') as Status | null) ?? null;

    for (const [s, handle] of this.handles) {
      if (s !== status) {
        handle.setDragOver(false);
        handle.setDropIndex(null);
      }
    }

    if (!status || !this.handles.has(status)) {
      this.targetLocation = null;
      return null;
    }

    const handle = this.handles.get(status)!;
    const index = this.insertionIndexAt(handle.element, clientY);
    handle.setDragOver(true);
    handle.setDropIndex(index);
    this.targetLocation = { status, index };
    return this.targetLocation;
  }

  /** Finish the drag: emit `taskDropped` on the resolved column, then reset. */
  drop(): void {
    const taskId = this.draggingId();
    const target = this.targetLocation;
    this.reset();
    if (taskId && target) {
      this.handles.get(target.status)?.emitDrop(taskId, target.index);
    }
  }

  /** Abort the drag with no drop (pointercancel, Escape, lost capture). */
  cancel(): void {
    this.reset();
  }

  private reset(): void {
    this.draggingId.set(null);
    this.targetLocation = null;
    for (const handle of this.handles.values()) {
      handle.setDragOver(false);
      handle.setDropIndex(null);
    }
  }

  /** Column root element under a viewport point, or null. Isolated for testing. */
  private columnElementAt(x: number, y: number): HTMLElement | null {
    const el = this.doc.elementFromPoint(x, y) as HTMLElement | null;
    return (el?.closest?.('[data-status]') as HTMLElement | null) ?? null;
  }

  /**
   * Insertion index within a column from a pointer Y position: the first
   * `.card-slot` whose vertical midpoint is below Y, else the slot count
   * (append). An empty column yields 0. Mirrors the top-half / bottom-half rule
   * of the HTML5 `onCardDragOver` path.
   */
  private insertionIndexAt(columnEl: HTMLElement, y: number): number {
    const slots = Array.from(columnEl.querySelectorAll<HTMLElement>('.card-slot'));
    for (let i = 0; i < slots.length; i++) {
      const rect = slots[i].getBoundingClientRect();
      if (y < rect.top + rect.height / 2) return i;
    }
    return slots.length;
  }
}
