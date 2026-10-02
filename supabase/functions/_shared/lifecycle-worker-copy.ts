// Exact plain-text copies from immutable marketing main 2b78d91, templates/email/*.yml.
export const COPY = {
  "abandoned_cart": {
    "subject": "Return to your custom phone case cart",
    "text":
      "Your custom phone case cart can be picked back up. Use your private link to\nrestore the eligible case and quantity. Snapcase checks the current price and\nmodel before restoring it. Standard U.S. shipping is confirmed at checkout.\n\n{{private_recovery_url}}\n\n{{sender_identity}}\n{{physical_postal_address}}\nUnsubscribe: {{unsubscribe_url}}",
  },
  "abandoned_design": {
    "subject": "Pick up your saved phone case design",
    "text":
      "You saved a phone case design with Snapcase. Use your private link to return\nto that exact saved version. You can review or edit it and preview before\ncheckout. If the link has expired or the design changed, Snapcase will give\nyou a safe way to open your saved designs instead.\n\n{{private_recovery_url}}\n\n{{sender_identity}}\n{{physical_postal_address}}\nUnsubscribe: {{unsubscribe_url}}",
  },
  "welcome": {
    "subject": "Ready to start your custom phone case?",
    "text":
      "Ready to start your custom phone case?\n\nChoose your phone model, upload an image, add text, and preview your custom phone case before checkout.\n\nStart designing your case:\nhttps://www.snapcase.ai/custom-phone-case?utm_source=lifecycle&utm_medium=email&utm_campaign=2026q3_welcome&utm_content=welcome_v1_primary_cta\n\nYou are receiving this because you asked to get marketing email from Snapcase.\n\n{{sender_identity}}\n{{physical_postal_address}}\nUnsubscribe from marketing email: {{unsubscribe_url}}",
  },
} as const;
