import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Loader2,
  PackageCheck,
  RefreshCw,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CartSheet } from "@/components/CartSheet";
import { RequireAuth } from "@/components/RequireAuth";
import { SiteMenu } from "@/components/SiteMenu";
import { supabase } from "@/integrations/supabase/client";

type ProductionJobStatus =
  | "queued"
  | "artwork_ready"
  | "printed"
  | "packed"
  | "shipped"
  | "failed";

type ProductionJobItem = {
  brand?: string;
  model?: string;
  quantity?: number;
  designPreview?: string | null;
  edmTemplateId?: number | null;
  designId?: string | null;
  externalProductId?: string | null;
};

type ProductionJob = {
  id: string;
  orderId: string;
  orderNumber: string;
  createdAt: string;
  updatedAt: string;
  status: ProductionJobStatus;
  fulfillmentProvider: string;
  fulfillmentStatus: string | null;
  customerEmail: string;
  customerName: string | null;
  total: number;
  items: ProductionJobItem[];
  shippingAddress: {
    address?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    country?: string | null;
  } | null;
  trackingNumber: string | null;
  trackingCarrier: string | null;
  trackingUrl: string | null;
  operatorNotes: string | null;
};

type DraftUpdate = {
  status: ProductionJobStatus;
  trackingNumber: string;
  trackingCarrier: string;
  trackingUrl: string;
  operatorNotes: string;
};

const STATUS_OPTIONS: ProductionJobStatus[] = [
  "queued",
  "artwork_ready",
  "printed",
  "packed",
  "shipped",
  "failed",
];

const statusLabels: Record<ProductionJobStatus, string> = {
  queued: "Queued",
  artwork_ready: "Artwork ready",
  printed: "Printed",
  packed: "Packed",
  shipped: "Shipped",
  failed: "Failed",
};

const statusClasses: Record<ProductionJobStatus, string> = {
  queued: "bg-warning/10 text-warning-emphasis border-warning/20",
  artwork_ready: "bg-accent/10 text-accent-emphasis border-accent/20",
  printed: "bg-primary/10 text-primary-emphasis border-primary/20",
  packed: "bg-primary/10 text-primary-emphasis border-primary/20",
  shipped: "bg-success/10 text-success-emphasis border-success/20",
  failed: "bg-destructive/10 text-destructive-emphasis border-destructive/20",
};

const buildDraft = (job: ProductionJob): DraftUpdate => ({
  status: job.status,
  trackingNumber: job.trackingNumber ?? "",
  trackingCarrier: job.trackingCarrier ?? "",
  trackingUrl: job.trackingUrl ?? "",
  operatorNotes: job.operatorNotes ?? "",
});

const formatAddress = (job: ProductionJob) => {
  const address = job.shippingAddress;
  if (!address) return "No shipping address";

  return [
    address.address,
    [address.city, address.state, address.zip].filter(Boolean).join(", "),
    address.country,
  ]
    .filter(Boolean)
    .join(" ");
};

const itemSummary = (items: ProductionJobItem[]) => {
  if (!items.length) return "Custom phone case";
  return items
    .map((item) => {
      const model =
        [item.brand, item.model].filter(Boolean).join(" ") || "Custom case";
      return `${model} x${item.quantity ?? 1}`;
    })
    .join(", ");
};

const OperationsContent = () => {
  const [jobs, setJobs] = useState<ProductionJob[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DraftUpdate>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [savingJobId, setSavingJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sortedJobs = useMemo(
    () =>
      [...jobs].sort((a, b) => {
        const statusDelta =
          STATUS_OPTIONS.indexOf(a.status) - STATUS_OPTIONS.indexOf(b.status);
        if (statusDelta !== 0) return statusDelta;
        return Date.parse(a.createdAt) - Date.parse(b.createdAt);
      }),
    [jobs],
  );

  const fetchJobs = async (refresh = false) => {
    if (refresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const { data, error: invokeError } =
        await supabase.functions.invoke("production-jobs");
      if (invokeError) {
        throw new Error(invokeError.message);
      }

      const nextJobs = Array.isArray(data?.jobs)
        ? (data.jobs as ProductionJob[])
        : [];
      setJobs(nextJobs);
      setDrafts(
        nextJobs.reduce<Record<string, DraftUpdate>>((acc, job) => {
          acc[job.id] = buildDraft(job);
          return acc;
        }, {}),
      );
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : "Unable to load production jobs.";
      setError(message);
      setJobs([]);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    void fetchJobs();
  }, []);

  const updateDraft = (jobId: string, patch: Partial<DraftUpdate>) => {
    setDrafts((prev) => ({
      ...prev,
      [jobId]: {
        ...prev[jobId],
        ...patch,
      },
    }));
  };

  const saveJob = async (job: ProductionJob) => {
    const draft = drafts[job.id] ?? buildDraft(job);
    setSavingJobId(job.id);

    try {
      const { error: invokeError } = await supabase.functions.invoke(
        "update-production-job",
        {
          body: {
            jobId: job.id,
            status: draft.status,
            trackingNumber: draft.trackingNumber.trim() || null,
            trackingCarrier: draft.trackingCarrier.trim() || null,
            trackingUrl: draft.trackingUrl.trim() || null,
            operatorNotes: draft.operatorNotes.trim() || null,
          },
        },
      );

      if (invokeError) {
        throw new Error(invokeError.message);
      }

      toast.success("Production job updated.");
      await fetchJobs(true);
    } catch (saveError) {
      const message =
        saveError instanceof Error
          ? saveError.message
          : "Unable to update production job.";
      toast.error(message);
    } finally {
      setSavingJobId(null);
    }
  };

  return (
    <div className="min-h-screen bg-surface-sunken">
      <nav className="bg-card border-b border-border">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="-ml-2 inline-flex min-h-11 items-center gap-2 px-2">
            <span className="font-display font-bold text-lg text-foreground">
              Snapcase
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <CartSheet />
            <SiteMenu />
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-6 py-10">
        <div className="max-w-6xl mx-auto space-y-6">
          <motion.div
            className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
          >
            <div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                <ShieldCheck className="w-4 h-4" />
                Internal operations
              </div>
              <h1 className="text-3xl font-bold">Onshore Production Queue</h1>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => fetchJobs(true)}
              disabled={isLoading || isRefreshing}
            >
              {isRefreshing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Refresh
            </Button>
          </motion.div>

          {isLoading ? (
            <div className="bg-card border border-border rounded-lg p-10 text-center">
              <Loader2 className="w-10 h-10 text-muted-foreground animate-spin mx-auto mb-4" />
              <p className="text-muted-foreground">
                Loading production jobs...
              </p>
            </div>
          ) : error ? (
            <div className="bg-card border border-border rounded-lg p-8">
              <h2 className="font-semibold mb-2">Unable to load queue</h2>
              <p className="text-sm text-muted-foreground mb-4">{error}</p>
              <Button type="button" onClick={() => fetchJobs()}>
                Try again
              </Button>
            </div>
          ) : sortedJobs.length === 0 ? (
            <div className="bg-card border border-border rounded-lg p-10 text-center">
              <PackageCheck className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-lg font-semibold mb-2">
                No onshore jobs queued
              </h2>
              <p className="text-sm text-muted-foreground">
                Paid onshore-manual orders will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {sortedJobs.map((job) => {
                const draft = drafts[job.id] ?? buildDraft(job);
                const preview = job.items.find(
                  (item) => item.designPreview,
                )?.designPreview;
                const isSaving = savingJobId === job.id;

                return (
                  <motion.article
                    key={job.id}
                    className="bg-card border border-border rounded-lg p-5 shadow-soft"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
                  >
                    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
                      <div className="flex gap-4">
                        <div className="w-20 h-28 rounded-md bg-muted flex items-center justify-center overflow-hidden shrink-0">
                          {preview ? (
                            <img
                              src={preview}
                              alt={`${itemSummary(job.items)} preview`}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <PackageCheck className="w-6 h-6 text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <h2 className="font-semibold">
                              Order #{job.orderNumber}
                            </h2>
                            <Badge className={statusClasses[job.status]}>
                              {statusLabels[job.status]}
                            </Badge>
                            <Badge variant="outline">
                              {job.fulfillmentProvider}
                            </Badge>
                          </div>
                          <p className="text-sm text-foreground">
                            {itemSummary(job.items)}
                          </p>
                          <p className="text-sm text-muted-foreground mt-1">
                            {job.customerName || job.customerEmail}
                          </p>
                          <p className="text-sm text-muted-foreground mt-1">
                            {formatAddress(job)}
                          </p>
                          <div className="grid gap-3 sm:grid-cols-3 mt-4 text-sm">
                            <div>
                              <p className="text-muted-foreground">Created</p>
                              <p>{new Date(job.createdAt).toLocaleString()}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Total</p>
                              <p>${Number(job.total).toFixed(2)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">
                                Fulfillment
                              </p>
                              <p>{job.fulfillmentStatus ?? "pending"}</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div>
                          <Label htmlFor={`status-${job.id}`}>Status</Label>
                          <select
                            id={`status-${job.id}`}
                            className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={draft.status}
                            onChange={(event) =>
                              updateDraft(job.id, {
                                status: event.target
                                  .value as ProductionJobStatus,
                              })
                            }
                            disabled={isSaving}
                          >
                            {STATUS_OPTIONS.map((status) => (
                              <option key={status} value={status}>
                                {statusLabels[status]}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <Label htmlFor={`carrier-${job.id}`}>Carrier</Label>
                            <Input
                              id={`carrier-${job.id}`}
                              value={draft.trackingCarrier}
                              onChange={(event) =>
                                updateDraft(job.id, {
                                  trackingCarrier: event.target.value,
                                })
                              }
                              disabled={isSaving}
                            />
                          </div>
                          <div>
                            <Label htmlFor={`tracking-${job.id}`}>
                              Tracking
                            </Label>
                            <Input
                              id={`tracking-${job.id}`}
                              value={draft.trackingNumber}
                              onChange={(event) =>
                                updateDraft(job.id, {
                                  trackingNumber: event.target.value,
                                })
                              }
                              disabled={isSaving}
                            />
                          </div>
                        </div>
                        <div>
                          <Label htmlFor={`url-${job.id}`}>Tracking URL</Label>
                          <Input
                            id={`url-${job.id}`}
                            value={draft.trackingUrl}
                            onChange={(event) =>
                              updateDraft(job.id, {
                                trackingUrl: event.target.value,
                              })
                            }
                            disabled={isSaving}
                          />
                        </div>
                        <div>
                          <Label htmlFor={`notes-${job.id}`}>Notes</Label>
                          <Textarea
                            id={`notes-${job.id}`}
                            value={draft.operatorNotes}
                            onChange={(event) =>
                              updateDraft(job.id, {
                                operatorNotes: event.target.value,
                              })
                            }
                            disabled={isSaving}
                            rows={3}
                          />
                        </div>
                        <Button
                          className="w-full bg-cta hover:bg-cta/90 text-cta-foreground"
                          onClick={() => saveJob(job)}
                          disabled={isSaving}
                        >
                          {isSaving ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Truck className="w-4 h-4 mr-2" />
                          )}
                          Save Update
                        </Button>
                      </div>
                    </div>
                  </motion.article>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

const Operations = () => (
  <RequireAuth>
    <OperationsContent />
  </RequireAuth>
);

export default Operations;
