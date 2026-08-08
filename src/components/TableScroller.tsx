import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode, type WheelEvent } from "react";

export function TableScroller({ children }: { children: ReactNode }) {
  const topRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startScroll: number } | null>(null);
  const [dimensions, setDimensions] = useState({ scrollWidth: 0, clientWidth: 0 });
  const [scrollLeft, setScrollLeft] = useState(0);

  useEffect(() => {
    const body = bodyRef.current;
    const content = contentRef.current;
    if (!body || !content) return;
    const measure = () => {
      setDimensions({ scrollWidth: content.scrollWidth, clientWidth: body.clientWidth });
      setScrollLeft(body.scrollLeft);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    observer.observe(content);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const maxScroll = Math.max(0, dimensions.scrollWidth - dimensions.clientWidth);
  const thumbWidth = dimensions.scrollWidth > 0
    ? Math.max(48, dimensions.clientWidth * dimensions.clientWidth / dimensions.scrollWidth)
    : dimensions.clientWidth;
  const availableTrack = Math.max(0, dimensions.clientWidth - thumbWidth);
  const thumbLeft = maxScroll > 0 ? scrollLeft / maxScroll * availableTrack : 0;

  function setHorizontalScroll(value: number) {
    const next = Math.max(0, Math.min(maxScroll, value));
    if (bodyRef.current) bodyRef.current.scrollLeft = next;
    setScrollLeft(next);
  }

  function syncFromBody() {
    if (bodyRef.current) setScrollLeft(bodyRef.current.scrollLeft);
  }

  function moveFromTrack(clientX: number) {
    const rect = topRef.current?.getBoundingClientRect();
    if (!rect || availableTrack <= 0) return;
    const fraction = Math.max(0, Math.min(1, (clientX - rect.left - thumbWidth / 2) / availableTrack));
    setHorizontalScroll(fraction * maxScroll);
  }

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    event.stopPropagation();
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startScroll: scrollLeft };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function drag(event: PointerEvent<HTMLDivElement>) {
    const active = dragRef.current;
    if (!active || active.pointerId !== event.pointerId || availableTrack <= 0) return;
    setHorizontalScroll(active.startScroll + (event.clientX - active.startX) / availableTrack * maxScroll);
  }

  function stopDrag(event: PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handleKeys(event: KeyboardEvent<HTMLDivElement>) {
    const smallStep = Math.max(40, dimensions.clientWidth * .1);
    const largeStep = dimensions.clientWidth * .8;
    const movement = ({ ArrowLeft: -smallStep, ArrowRight: smallStep, PageUp: -largeStep, PageDown: largeStep } as Record<string, number>)[event.key];
    if (event.key === "Home") setHorizontalScroll(0);
    else if (event.key === "End") setHorizontalScroll(maxScroll);
    else if (movement !== undefined) setHorizontalScroll(scrollLeft + movement);
    else return;
    event.preventDefault();
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    const movement = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (!movement) return;
    event.preventDefault();
    setHorizontalScroll(scrollLeft + movement);
  }

  return (
    <>
      {dimensions.scrollWidth > dimensions.clientWidth + 1 ? (
        <div
          className="table-top-scroll"
          ref={topRef}
          role="scrollbar"
          aria-label="Horizontal table scroll"
          aria-orientation="horizontal"
          aria-valuemin={0}
          aria-valuemax={Math.round(maxScroll)}
          aria-valuenow={Math.round(scrollLeft)}
          tabIndex={0}
          onKeyDown={handleKeys}
          onWheel={handleWheel}
          onPointerDown={(event) => moveFromTrack(event.clientX)}
        >
          <div
            className="table-scroll-thumb"
            style={{ width: thumbWidth, transform: `translateX(${thumbLeft}px)` }}
            onPointerDown={startDrag}
            onPointerMove={drag}
            onPointerUp={stopDrag}
            onPointerCancel={stopDrag}
          />
        </div>
      ) : null}
      <div className="table-scroll" ref={bodyRef} onScroll={syncFromBody} role="region" tabIndex={0} aria-label="Skill comparison table">
        <div className="table-width-measurer" ref={contentRef}>{children}</div>
      </div>
    </>
  );
}
