/**
 * Admin KYC document preview panel.
 *
 * Gives reviewers a real look at the uploaded evidence before they decide:
 * a thumbnail rail of every upload, a zoom/pan viewer for images (wheel,
 * trackpad pinch, buttons, rotate), an inline PDF frame, and a checklist of
 * the Ghana Card and supporting documents required for this member. The
 * checklist mirrors the server-side approval gate, so a reviewer sees exactly
 * what would block an approval.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Maximize2,
  Minus,
  Plus,
  RotateCw,
} from "lucide-react";
import { SectionCard } from "@/components/primitives";
import { buildKycChecklist, kycDocLabel } from "@/lib/kyc-document-checklist";
import { cn } from "@/lib/utils";

export type PreviewDocument = {
  id: string;
  doc_type: string;
  mime_type: string;
  size_bytes: number;
  status?: string | null;
  review_notes?: string | null;
  created_at: string;
  signed_url: string | null;
};

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 8;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function isImage(mime: string) {
  return mime.startsWith("image/");
}
function isPdf(mime: string) {
  return mime === "application/pdf";
}

export function DocumentPreviewPanel({
  documents,
  isMinor = false,
}: {
  documents: readonly PreviewDocument[];
  isMinor?: boolean;
}) {
  const checklist = useMemo(() => buildKycChecklist(documents, { isMinor }), [documents, isMinor]);
  const missing = checklist.filter((r) => r.requirement === "required" && !r.present);

  const [activeId, setActiveId] = useState<string | null>(documents[0]?.id ?? null);
  const active = documents.find((d) => d.id === activeId) ?? documents[0] ?? null;

  useEffect(() => {
    if (!documents.some((d) => d.id === activeId)) setActiveId(documents[0]?.id ?? null);
  }, [documents, activeId]);

  return (
    <SectionCard title="Documents & verification checklist">
      <div className="space-y-5 p-6">
        <div
          className={cn(
            "rounded border px-3 py-2 text-[11px] leading-relaxed",
            missing.length === 0
              ? "border-emerald-mid/40 bg-emerald-mid/10 text-muted-foreground"
              : "border-destructive/40 bg-destructive/10 text-destructive",
          )}
        >
          {missing.length === 0 ? (
            <>
              <strong className="uppercase tracking-widest">Complete</strong> — every required
              document is on file. Review each one below before deciding.
            </>
          ) : (
            <>
              <strong className="uppercase tracking-widest">Incomplete</strong> — approval is
              blocked until these are uploaded: {missing.map((m) => m.label).join(", ")}.
            </>
          )}
        </div>

        <ul className="grid gap-2 sm:grid-cols-2">
          {checklist.map((row) => {
            const blocking = row.requirement === "required" && !row.present;
            return (
              <li
                key={row.doc_type}
                className="flex items-start gap-2 rounded border border-emerald-deep/10 bg-cream/40 px-3 py-2"
              >
                <span
                  aria-hidden
                  className={cn(
                    "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full",
                    row.present
                      ? "bg-emerald-mid/20 text-emerald-mid"
                      : blocking
                        ? "bg-destructive/15 text-destructive"
                        : "bg-emerald-deep/10 text-muted-foreground",
                  )}
                >
                  {row.present ? (
                    <Check className="h-3 w-3" />
                  ) : blocking ? (
                    <AlertTriangle className="h-2.5 w-2.5" />
                  ) : null}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold">
                    {row.label}
                    <span className="ml-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      {row.requirement}
                    </span>
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {row.present
                      ? `On file${row.status ? ` · ${row.status}` : ""}`
                      : blocking
                        ? "Missing"
                        : "Not supplied"}{" "}
                    · {row.hint}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>

        {documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Uploaded documents">
              {documents.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  role="tab"
                  aria-selected={active?.id === d.id}
                  onClick={() => setActiveId(d.id)}
                  className={cn(
                    "w-28 shrink-0 rounded border p-1 text-left transition",
                    active?.id === d.id
                      ? "border-emerald-mid ring-1 ring-emerald-mid"
                      : "border-emerald-deep/15 hover:border-emerald-deep/40",
                  )}
                  title={kycDocLabel(d.doc_type)}
                >
                  <span className="grid h-16 w-full place-items-center overflow-hidden rounded bg-cream/70">
                    {isImage(d.mime_type) && d.signed_url ? (
                      <img
                        src={d.signed_url}
                        alt={kycDocLabel(d.doc_type)}
                        loading="lazy"
                        className="h-16 w-full object-cover"
                      />
                    ) : isPdf(d.mime_type) ? (
                      <FileText className="h-6 w-6 text-muted-foreground" />
                    ) : (
                      <ImageIcon className="h-6 w-6 text-muted-foreground" />
                    )}
                  </span>
                  <span className="mt-1 block truncate text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    {d.doc_type.replace(/_/g, " ")}
                  </span>
                </button>
              ))}
            </div>

            {active ? <Viewer doc={active} /> : null}
          </div>
        )}
      </div>
    </SectionCard>
  );
}

function Viewer({ doc }: { doc: PreviewDocument }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const reset = useCallback(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setRotation(0);
  }, []);

  useEffect(() => {
    reset();
  }, [doc.id, reset]);

  const zoomAt = useCallback((next: number, px: number, py: number) => {
    setZoom((z) => {
      const clamped = clamp(next, MIN_ZOOM, MAX_ZOOM);
      const k = clamped / z;
      setOffset((o) => ({ x: px - (px - o.x) * k, y: py - (py - o.y) * k }));
      return clamped;
    });
  }, []);

  // Keep the latest handler in a ref so the native non-passive listener never
  // sees stale zoom/offset state.
  const wheelRef = useRef<(e: WheelEvent) => void>(() => {});
  wheelRef.current = (e: WheelEvent) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
    zoomAt(zoom * Math.exp(-dy * 0.0015), e.clientX - rect.left, e.clientY - rect.top);
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      wheelRef.current(e);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const stepZoom = (factor: number) => {
    const el = containerRef.current;
    const rect = el?.getBoundingClientRect();
    zoomAt(zoom * factor, (rect?.width ?? 0) / 2, (rect?.height ?? 0) / 2);
  };

  const image = isImage(doc.mime_type) && doc.signed_url;
  const pdf = isPdf(doc.mime_type) && doc.signed_url;

  return (
    <div className="rounded border border-emerald-deep/15">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-deep/10 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold">{kycDocLabel(doc.doc_type)}</p>
          <p className="text-[11px] text-muted-foreground">
            {new Date(doc.created_at).toLocaleString()} · {(doc.size_bytes / 1024).toFixed(0)} KB ·{" "}
            {doc.mime_type}
            {doc.status ? ` · ${doc.status}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {image ? (
            <>
              <ToolButton label="Zoom out" onClick={() => stepZoom(1 / 1.3)}>
                <Minus className="h-3 w-3" />
              </ToolButton>
              <span className="w-12 text-center text-[10px] font-bold tabular-nums text-muted-foreground">
                {Math.round(zoom * 100)}%
              </span>
              <ToolButton label="Zoom in" onClick={() => stepZoom(1.3)}>
                <Plus className="h-3 w-3" />
              </ToolButton>
              <ToolButton label="Rotate" onClick={() => setRotation((r) => (r + 90) % 360)}>
                <RotateCw className="h-3 w-3" />
              </ToolButton>
              <ToolButton label="Reset view" onClick={reset}>
                <Maximize2 className="h-3 w-3" />
              </ToolButton>
            </>
          ) : null}
          {doc.signed_url ? (
            <a
              href={doc.signed_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded border border-emerald-deep/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest hover:bg-cream"
            >
              Open <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
        </div>
      </div>

      {image ? (
        <div
          ref={containerRef}
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
          }}
          onPointerMove={(e) => {
            const d = dragRef.current;
            if (!d) return;
            setOffset({ x: d.ox + (e.clientX - d.x), y: d.oy + (e.clientY - d.y) });
          }}
          onPointerUp={() => (dragRef.current = null)}
          onPointerLeave={() => (dragRef.current = null)}
          className="relative h-[26rem] cursor-grab overflow-hidden bg-cream/60 active:cursor-grabbing"
          style={{ touchAction: "none" }}
          aria-label="Document preview, scroll to zoom and drag to pan"
        >
          <img
            src={doc.signed_url!}
            alt={kycDocLabel(doc.doc_type)}
            draggable={false}
            className="absolute left-0 top-0 max-w-none select-none"
            style={{
              transformOrigin: "0 0",
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom}) rotate(${rotation}deg)`,
              width: "100%",
            }}
          />
        </div>
      ) : pdf ? (
        <iframe
          src={doc.signed_url!}
          title={kycDocLabel(doc.doc_type)}
          className="h-[26rem] w-full bg-cream/60"
        />
      ) : (
        <div className="grid h-40 place-items-center text-xs text-muted-foreground">
          Preview unavailable for this file type — use “Open” to download it.
        </div>
      )}

      {doc.review_notes ? (
        <p className="border-t border-emerald-deep/10 px-3 py-2 text-[11px] text-muted-foreground">
          Notes: {doc.review_notes}
        </p>
      ) : null}
    </div>
  );
}

function ToolButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid h-6 w-6 place-items-center rounded border border-emerald-deep/15 text-muted-foreground hover:bg-cream"
    >
      {children}
    </button>
  );
}
