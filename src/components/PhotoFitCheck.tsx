import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { phoneVariants } from "@/data/phoneVariants";
import { trackMarketingEvent } from "@/lib/marketing";

const photoOptions = [
  {
    id: "room-around-subject",
    label: "Space around the subject",
    advice: "Start with this photo. In the editor, move the subject below the camera opening and check that important details stay inside the case edges.",
  },
  {
    id: "tight-close-up",
    label: "A tight close-up",
    advice: "Try the original, uncropped photo if you have it. Leave room above ears and around faces; shrinking the photo or adding a background can help keep those details visible.",
  },
  {
    id: "wide-or-group",
    label: "A wide or group photo",
    advice: "A phone case is tall and narrow. Try a portrait crop first, keeping every face in view. If the crop loses someone, choose a different photo or leave space around the image.",
  },
];

export const PhotoFitCheck = ({ audience }: { audience: "pet" | "gift" }) => {
  const [photoType, setPhotoType] = useState(photoOptions[0].id);
  const [modelId, setModelId] = useState("");
  const selectedPhoto = photoOptions.find((option) => option.id === photoType) ?? photoOptions[0];
  const selectedModel = phoneVariants.find((variant) => variant.id === modelId);
  const destination = selectedModel ? `/design/${selectedModel.id}` : "/catalog";
  const ctaLabel = selectedModel ? `Design for ${selectedModel.model}` : "Choose a supported phone model";

  return (
    <section id="photo-fit-check" aria-labelledby="photo-fit-heading" className="scroll-mt-20 border-y border-border bg-surface-sunken py-12 sm:py-16">
      <div className="container mx-auto grid gap-8 px-6 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
        <div>
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-cta-emphasis">
            <ScanLine className="size-5" aria-hidden="true" /> Your photo, your plan
          </p>
          <h2 id="photo-fit-heading" className="max-w-[18ch] text-balance font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Check the photo before you design.
          </h2>
          <p className="mt-4 max-w-lg text-base leading-7 text-muted-foreground">
            {audience === "pet" ? "Keep the ears, eyes, and personality in the picture." : "Start a personal gift with a photo that means something to them."} Use this checklist while looking at your photo; no upload is needed here.
          </p>
          <ul className="mt-6 space-y-3 text-sm leading-6">
            <li className="flex gap-3"><Check className="mt-1 size-4 shrink-0 text-cta-emphasis" aria-hidden="true" /><span>Use a sharp original photo that you own or have permission to use.</span></li>
            <li className="flex gap-3"><Check className="mt-1 size-4 shrink-0 text-cta-emphasis" aria-hidden="true" /><span>Keep faces, {audience === "pet" ? "ears, " : "names, "}and other important details away from the camera opening and edges.</span></li>
            <li className="flex gap-3"><Check className="mt-1 size-4 shrink-0 text-cta-emphasis" aria-hidden="true" /><span>Check the exact model and the design preview before adding the case to your cart.</span></li>
          </ul>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-7">
          <fieldset>
            <legend className="mb-3 text-base font-semibold">1. How is your photo framed?</legend>
            <div className="grid gap-2">
              {photoOptions.map((option) => (
                <label key={option.id} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm ${photoType === option.id ? "border-cta bg-cta/5" : "border-border hover:bg-surface-sunken"}`}>
                  <input type="radio" name={`photo-fit-${audience}`} value={option.id} checked={photoType === option.id} onChange={() => setPhotoType(option.id)} className="size-4 accent-[hsl(var(--cta))]" />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>
          <p aria-live="polite" className="my-5 min-h-24 border-l-2 border-cta pl-4 text-sm leading-6 text-muted-foreground">{selectedPhoto.advice}</p>
          <label htmlFor="photo-fit-model" className="mb-2 block text-base font-semibold">2. Which exact phone model?</label>
          <select id="photo-fit-model" value={modelId} onChange={(event) => setModelId(event.target.value)} className="min-h-12 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" aria-describedby="photo-fit-model-tip">
            <option value="">Choose a model, or check the catalog</option>
            {phoneVariants.map((variant) => <option key={variant.id} value={variant.id}>{variant.brand} {variant.model}</option>)}
          </select>
          <p id="photo-fit-model-tip" className="mt-2 text-xs leading-5 text-muted-foreground">{audience === "gift" ? "Ask the recipient or check their phone settings. " : "Check your phone settings. "}Similar names can need different cases.</p>
          <Button asChild className="mt-5 min-h-12 w-full whitespace-normal bg-cta py-3 text-cta-foreground hover:bg-cta/90">
            <Link to={destination} onClick={() => trackMarketingEvent("primary_cta_click", { placement: `photo_fit_check_${audience}`, label: ctaLabel, destination, photo_framing: photoType, model_id: selectedModel?.id ?? "not_selected" })}>
              {ctaLabel}<ArrowRight className="ml-2 size-4 shrink-0" aria-hidden="true" />
            </Link>
          </Button>
          <p className="mt-3 text-center text-xs leading-5 text-muted-foreground">Upload and adjust your photo in the editor. Review the preview before checkout.</p>
        </div>
      </div>
    </section>
  );
};
