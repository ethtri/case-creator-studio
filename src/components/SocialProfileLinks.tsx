import { SOCIAL_PROFILES } from "@/lib/social-profiles";
import { trackMarketingEvent } from "@/lib/marketing";

export const SocialProfileLinks = () => (
  <nav aria-label="Snapcase social profiles" data-social-profile-links="true">
    <ul className="flex flex-wrap items-center justify-center gap-x-2 gap-y-2">
      {SOCIAL_PROFILES.map((profile) => (
        <li key={profile.id}>
          <a
            href={profile.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Snapcase on ${profile.label} (opens in a new tab)`}
            data-social-platform={profile.id}
            onClick={() =>
              trackMarketingEvent("primary_cta_click", {
                placement: "homepage_footer_social_profile",
                platform: profile.id,
                label: profile.label,
                destination: profile.href,
              })
            }
            className="inline-flex min-h-11 items-center rounded-full border border-border/60 px-3 text-sm font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {profile.label}
          </a>
        </li>
      ))}
    </ul>
  </nav>
);
