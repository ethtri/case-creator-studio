import { useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { ArrowLeftRight } from "lucide-react";
import { buildViewportSnapshot, describeDebugBrowser } from "@/lib/editor-viewport-debug";

type Props = {
  shell: RefObject<HTMLDivElement>;
  area: RefObject<HTMLDivElement>;
  container: RefObject<HTMLDivElement>;
};

export function EditorViewportDebug({ shell, area, container }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [onLeft, setOnLeft] = useState(false);
  const [snapshots, setSnapshots] = useState<ReturnType<typeof buildViewportSnapshot>[]>([]);
  const [copyStatus, setCopyStatus] = useState("");
  const capture = () => {
    const viewport = window.visualViewport;
    // Fixed and hidden: measure CSS dynamic viewport height without occupying flow.
    const probe = document.createElement("div");
    probe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;top:0;left:0;width:0;height:100dvh;contain:strict;";
    document.body.appendChild(probe);
    const dynamicViewportHeight = probe.getBoundingClientRect().height;
    probe.remove();
    const next = buildViewportSnapshot({
      timestamp: new Date().toISOString(), innerHeight: window.innerHeight,
      clientHeight: document.documentElement.clientHeight,
      scrollY: window.scrollY, dynamicViewportHeight,
      viewport,
      rects: {
        shell: shell.current?.getBoundingClientRect() ?? null,
        area: area.current?.getBoundingClientRect() ?? null,
        container: container.current?.getBoundingClientRect() ?? null,
        iframe: container.current?.querySelector("iframe")?.getBoundingClientRect() ?? null,
      },
    });
    setSnapshots((previous) => [...previous.slice(-7), next]);
    setCopyStatus("");
  };
  const latest = snapshots[snapshots.length - 1];
  const browser = describeDebugBrowser(navigator.userAgent);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify({
        diagnostic: "snapcase-editor-viewport-v1",
        browser: describeDebugBrowser(navigator.userAgent), snapshots,
        scope: "Host geometry only; vendor contents are cross-origin and not measured.",
      }, null, 2));
      setCopyStatus("Copied locally");
    } catch {
      setCopyStatus("Copy unavailable. Take a screenshot of the readings.");
    }
  };
  const buttonClass = "min-h-11 rounded-md border border-border px-2 text-xs font-medium hover:bg-muted focus-visible:outline focus-visible:outline-2";
  return createPortal(
    <section aria-label="Editor viewport diagnostic" data-viewport-debug
      className={`fixed top-[calc(env(safe-area-inset-top)+4rem)] z-[100] max-w-[calc(100vw-1rem)] rounded-lg border border-border bg-card text-foreground shadow-lg ${onLeft ? "left-2" : "right-2"}`}>
      <div className="flex gap-1 p-1">
        <button className={buttonClass} aria-expanded={expanded} onClick={() => { if (!expanded && !latest) capture(); setExpanded(!expanded); }}>
          {expanded ? "Hide readings" : "Layout readings"}
        </button>
        <button className={buttonClass} onClick={() => setOnLeft(!onLeft)} aria-label="Move diagnostic to other side"><ArrowLeftRight className="h-4 w-4" /></button>
      </div>
      {expanded && <div className="w-72 max-h-[70dvh] overflow-auto border-t border-border p-2">
        <p className="text-[11px] text-muted-foreground">snapcase-editor-viewport-v1 · local only</p>
        <p className="text-xs">Browser/OS tokens: {browser.browser} · {browser.os}</p>
        <div className="my-1 flex gap-1">
          <button className={buttonClass} onClick={capture}>Capture state</button>
          <button className={buttonClass} disabled={!latest} onClick={copy}>Copy readings</button>
        </div>
        {latest && <>
          <div className="font-mono text-[11px] leading-4" data-viewport-debug-summary>
            <p>{latest.timestamp}</p>
            <p>inner/client: {latest.innerHeight}/{latest.clientHeight}</p>
            <p>100dvh: {latest.dynamicViewportHeight} · scrollY: {latest.scrollY}</p>
            <p>VV w/h: {latest.visualViewport?.width ?? "n/a"}/{latest.visualViewport?.height ?? "n/a"}</p>
            <p>VV left/top: {latest.visualViewport?.offsetLeft ?? "n/a"}/{latest.visualViewport?.offsetTop ?? "n/a"} · scale: {latest.visualViewport?.scale ?? "n/a"}</p>
            <p>rect: top / height / bottom</p>
            {Object.entries(latest.rects).map(([name, rect]) => <p key={name}>{name}: {rect ? `${rect.top} / ${rect.height} / ${rect.bottom}` : "unavailable"}</p>)}
          </div>
          <details className="mt-1 text-xs"><summary className="min-h-11 cursor-pointer py-3">Full readings (selectable)</summary>
            <pre className="whitespace-pre-wrap break-all select-text font-mono text-[11px] leading-4">{JSON.stringify({ diagnostic: "snapcase-editor-viewport-v1", browser, snapshots }, null, 2)}</pre>
          </details>
        </>}
        <p className="text-xs" role="status">{copyStatus || `${snapshots.length} captured states`}</p>
      </div>}
    </section>, document.body,
  );
}
