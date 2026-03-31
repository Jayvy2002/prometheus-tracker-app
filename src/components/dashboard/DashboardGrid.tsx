import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { DashboardWidget, WidgetType } from '../../lib/types';
import { autoLayout, spanOf, findDropTarget, maxRow, layoutWithDragPreview } from '../../lib/gridLayout';
import WidgetCard from './WidgetCard';

const COLS = 3;
const GAP = 8;
const RESIZABLE_TYPES: WidgetType[] = ['calories', 'water', 'macros', 'steps', 'streak'];
const SIZE_CYCLE: DashboardWidget['size'][] = ['small', 'medium', 'large'];

interface Props {
  widgets: DashboardWidget[];
  editMode: boolean;
  onSave: (widgets: DashboardWidget[]) => Promise<void>;
  onEnterEditMode: () => void;
}

export default function DashboardGrid({ widgets, editMode, onSave, onEnterEditMode }: Props) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [ghostPos, setGhostPos] = useState({ x: 0, y: 0 });
  const [ghostSize, setGhostSize] = useState({ w: 0, h: 0 });
  const [dropTarget, setDropTarget] = useState<{ row: number; col: number } | null>(null);
  const [droppedId, setDroppedId] = useState<string | null>(null);
  const offsetRef = useRef({ x: 0, y: 0 });
  const widgetElsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);
  const hasDraggedRef = useRef(false);
  const previewPlacedRef = useRef<ReturnType<typeof autoLayout>>([]);

  const basePlaced = useMemo(() => autoLayout(widgets), [widgets]);

  const previewPlaced = useMemo(() => {
    if (!dragId || !dropTarget) return basePlaced;
    const preview = layoutWithDragPreview(widgets, dragId, dropTarget.row, dropTarget.col);
    previewPlacedRef.current = preview;
    return preview;
  }, [dragId, dropTarget, widgets, basePlaced]);

  const totalRows = maxRow(previewPlaced);

  const getGridMetrics = useCallback(() => {
    const grid = gridRef.current;
    if (!grid) return null;
    const rect = grid.getBoundingClientRect();
    const cellWidth = (rect.width - GAP * (COLS - 1)) / COLS;
    const firstWidget = widgetElsRef.current.values().next().value as HTMLDivElement | undefined;
    const rowHeight = firstWidget ? firstWidget.offsetHeight : cellWidth;
    return { rect, cellWidth, rowHeight };
  }, []);

  const startDrag = useCallback((widgetId: string, clientX: number, clientY: number) => {
    const el = widgetElsRef.current.get(widgetId);
    if (!el) return;
    const elRect = el.getBoundingClientRect();
    offsetRef.current = { x: 0, y: 0 };
    setDragId(widgetId);
    setGhostPos({ x: clientX, y: clientY });
    setGhostSize({ w: elRect.width, h: elRect.height });

    const pw = basePlaced.find(w => w.id === widgetId);
    if (pw) setDropTarget({ row: pw.row, col: pw.col });
  }, [basePlaced]);

  const scrollAnimRef = useRef<number | null>(null);
  const lastCursorRef = useRef<{ cx: number; cy: number } | null>(null);

  useEffect(() => {
    if (dragId === null) {
      if (scrollAnimRef.current !== null) {
        cancelAnimationFrame(scrollAnimRef.current);
        scrollAnimRef.current = null;
      }
      lastCursorRef.current = null;
      return;
    }

    const SCROLL_ZONE = 80;
    const MAX_SPEED = 12;

    const runScroll = () => {
      const pos = lastCursorRef.current;
      if (!pos) { scrollAnimRef.current = requestAnimationFrame(runScroll); return; }

      const vh = window.innerHeight;
      const cy = pos.cy;
      let speed = 0;

      if (cy < SCROLL_ZONE) {
        speed = -MAX_SPEED * (1 - cy / SCROLL_ZONE);
      } else if (cy > vh - SCROLL_ZONE) {
        speed = MAX_SPEED * ((cy - (vh - SCROLL_ZONE)) / SCROLL_ZONE);
      }

      if (speed !== 0) {
        window.scrollBy(0, speed);

        const metrics = getGridMetrics();
        if (metrics) {
          const target = findDropTarget(
            basePlaced, dragId, metrics.rect, metrics.cellWidth, metrics.rowHeight, GAP, pos.cx, pos.cy, dragSpan,
          );
          if (target) setDropTarget(target);
        }
      }

      scrollAnimRef.current = requestAnimationFrame(runScroll);
    };

    const dragWidget = basePlaced.find(w => w.id === dragId);
    if (!dragWidget) return;
    const dragSpan = spanOf(dragWidget.size);

    scrollAnimRef.current = requestAnimationFrame(runScroll);

    const onMove = (cx: number, cy: number) => {
      hasDraggedRef.current = true;
      lastCursorRef.current = { cx, cy };
      setGhostPos({ x: cx, y: cy });

      const metrics = getGridMetrics();
      if (!metrics) return;

      const target = findDropTarget(
        basePlaced, dragId, metrics.rect, metrics.cellWidth, metrics.rowHeight, GAP, cx, cy, dragSpan,
      );
      if (target) setDropTarget(target);
    };

    const onMouseMove = (e: MouseEvent) => onMove(e.clientX, e.clientY);
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      onMove(e.touches[0].clientX, e.touches[0].clientY);
    };

    const onEnd = () => {
      if (scrollAnimRef.current !== null) {
        cancelAnimationFrame(scrollAnimRef.current);
        scrollAnimRef.current = null;
      }
      lastCursorRef.current = null;

      if (dragId && dropTarget && hasDraggedRef.current) {
        const finalLayout = previewPlacedRef.current;
        const updated = widgets.map(w => {
          const placed = finalLayout.find(p => p.id === w.id);
          return placed ? { ...w, row: placed.row, col: placed.col } : w;
        });
        onSave(updated);
      }
      setDroppedId(dragId);
      setDragId(null);
      setDropTarget(null);
      hasDraggedRef.current = false;
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onEnd);

    return () => {
      if (scrollAnimRef.current !== null) {
        cancelAnimationFrame(scrollAnimRef.current);
        scrollAnimRef.current = null;
      }
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onEnd);
    };
  }, [dragId, dropTarget, basePlaced, widgets, onSave, getGridMetrics]);

  useEffect(() => {
    if (droppedId) {
      const timer = setTimeout(() => setDroppedId(null), 400);
      return () => clearTimeout(timer);
    }
  }, [droppedId]);

  const removeWidget = (widgetId: string) => {
    onSave(widgets.filter(w => w.id !== widgetId));
  };

  const cycleSize = (widgetId: string) => {
    const updated = widgets.map(w => {
      if (w.id !== widgetId) return w;
      if (!RESIZABLE_TYPES.includes(w.type)) return w;
      const idx = SIZE_CYCLE.indexOf(w.size);
      return { ...w, size: SIZE_CYCLE[(idx + 1) % SIZE_CYCLE.length], row: undefined, col: undefined };
    });
    onSave(updated);
  };

  const handleLongPressStart = useCallback((widgetId: string, clientX: number, clientY: number) => {
    if (editMode) {
      startDrag(widgetId, clientX, clientY);
      return;
    }
    longPressStartRef.current = { x: clientX, y: clientY };
    longPressTimerRef.current = setTimeout(() => {
      onEnterEditMode();
      setTimeout(() => startDrag(widgetId, clientX, clientY), 50);
    }, 500);
  }, [editMode, startDrag, onEnterEditMode]);

  const handleLongPressMove = useCallback((clientX: number, clientY: number) => {
    if (!longPressStartRef.current) return;
    const dx = Math.abs(clientX - longPressStartRef.current.x);
    const dy = Math.abs(clientY - longPressStartRef.current.y);
    if (dx > 8 || dy > 8) {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      longPressStartRef.current = null;
    }
  }, []);

  const handleLongPressEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressStartRef.current = null;
  }, []);

  useEffect(() => {
    if (!editMode) return;
    const onMouseUp = () => handleLongPressEnd();
    window.addEventListener('mouseup', onMouseUp);
    return () => window.removeEventListener('mouseup', onMouseUp);
  }, [editMode, handleLongPressEnd]);

  const handleWidgetMouseDown = (widgetId: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    handleLongPressStart(widgetId, e.clientX, e.clientY);
  };

  const handleWidgetTouchStart = (widgetId: string) => (e: React.TouchEvent) => {
    handleLongPressStart(widgetId, e.touches[0].clientX, e.touches[0].clientY);
  };

  const handleWidgetTouchMove = (e: React.TouchEvent) => {
    handleLongPressMove(e.touches[0].clientX, e.touches[0].clientY);
  };

  const handleWidgetTouchEnd = () => {
    handleLongPressEnd();
  };

  const draggedWidget = dragId ? basePlaced.find(w => w.id === dragId) : null;

  const displayPlaced = dragId && dropTarget ? previewPlaced : basePlaced;

  return (
    <>
      <div
        ref={gridRef}
        className="grid gap-2 relative"
        style={{
          gridTemplateColumns: `repeat(${COLS}, 1fr)`,
          gridTemplateRows: `repeat(${totalRows}, auto)`,
        }}
      >
        {displayPlaced.map((pw, index) => {
          const isDragging = dragId === pw.id;
          const wiggleAlt = index % 2 === 1;

          return (
            <div
              key={pw.id}
              ref={(el) => {
                if (el) widgetElsRef.current.set(pw.id, el);
                else widgetElsRef.current.delete(pw.id);
              }}
              className={`
                ${droppedId === pw.id ? 'animate-widget-drop' : ''}
                ${editMode && !isDragging ? (wiggleAlt ? 'animate-widget-wiggle-alt' : 'animate-widget-wiggle') : ''}
              `}
              style={{
                gridRow: pw.row + 1,
                gridColumn: `${pw.col + 1} / span ${spanOf(pw.size)}`,
                transition: dragId && !isDragging
                  ? 'grid-row 0.2s cubic-bezier(0.16,1,0.3,1), grid-column 0.2s cubic-bezier(0.16,1,0.3,1)'
                  : undefined,
                animationDelay: editMode ? `${(index * 40) % 120}ms` : `${pw.order * 60}ms`,
                opacity: isDragging ? 0 : 1,
              }}
            >
              <WidgetCard
                widget={pw}
                editMode={editMode}
                isDragging={isDragging}
                droppedId={droppedId}
                onRemove={() => removeWidget(pw.id)}
                onCycleSize={() => cycleSize(pw.id)}
                onPointerDown={handleWidgetMouseDown(pw.id)}
                onTouchStart={handleWidgetTouchStart(pw.id)}
                onTouchMove={handleWidgetTouchMove}
                onTouchEnd={handleWidgetTouchEnd}
              />
            </div>
          );
        })}
      </div>

      {dragId && draggedWidget && createPortal(
        <div
          className="fixed z-[100] pointer-events-none"
          style={{
            left: ghostPos.x - ghostSize.w / 2,
            top: ghostPos.y - ghostSize.h / 2,
            width: ghostSize.w,
            height: ghostSize.h,
            transform: 'scale(1.05)',
            transformOrigin: 'center center',
            transition: 'none',
            opacity: 0.95,
            boxShadow: '0 24px 70px rgba(0,0,0,0.7)',
            borderRadius: '1rem',
            overflow: 'hidden',
          }}
        >
          <WidgetCard
            widget={draggedWidget}
            editMode={false}
            onRemove={() => {}}
            onCycleSize={() => {}}
          />
        </div>,
        document.body,
      )}
    </>
  );
}
