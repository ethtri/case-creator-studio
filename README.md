# Snapcase App V2

A modern phone case customization platform built with React, TypeScript, and Supabase.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Set up environment variables (see docs/SETUP_GUIDE.md)
cp .env.example .env
# Edit .env with your API keys

# Start development server
npm run dev
```

Visit http://localhost:8080

## 📚 Documentation

All project documentation is organized in the [`docs/`](./docs/) directory.

**Quick Links:**
- **[📖 Documentation Index](./docs/README.md)** - Navigate all docs
- **[⭐ Quick Reference](./docs/QUICK_REFERENCE.md)** - Common commands
- **[🤖 AI Agent Prompts](./docs/AI_AGENT_PROMPTS.md)** - For AI agents

**By Category:**
- **Getting Started**: [Setup Guide](./docs/SETUP_GUIDE.md) | [Quick Reference](./docs/QUICK_REFERENCE.md)
- **Daily Workflows**: [Development Workflow](./docs/DEVELOPMENT_WORKFLOW.md) | [Error Prevention Checklist](./docs/ERROR_PREVENTION_CHECKLIST.md)
- **Best Practices**: [Project Management](./docs/PROJECT_MANAGEMENT.md) | [Contributing](./docs/CONTRIBUTING.md)
- **AI Agents**: [AI Agent Prompts](./docs/AI_AGENT_PROMPTS.md) | [Sprint Template](./docs/sprints/SPRINT_TEMPLATE.md)

## 🛠️ Tech Stack

- **Frontend**: React 18, TypeScript, Vite
- **UI**: shadcn/ui, Tailwind CSS
- **Backend**: Supabase (Database, Auth, Edge Functions)
- **Integrations**: Printful (Fulfillment), Stripe (Payments)
- **State Management**: React Query, Context API

## 📋 Project Info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## 🎯 Key Features

- Custom phone case design editor
- Real-time preview
- Secure checkout with Stripe
- Automated order fulfillment with Printful
- Order tracking and management

## 📖 Available Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build
npm run lint         # Check code quality
npm run lint:fix     # Auto-fix linting issues
npm run type-check   # Check TypeScript types
npm run check        # Run all quality checks
npm run audit        # Check for security vulnerabilities
```

## 🔐 Environment Variables

Required environment variables (see `.env.example`):

- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` - Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (backend)
- `PRINTFUL_API_KEY` - Printful API key
- `STRIPE_SECRET_KEY` - Stripe secret key

**⚠️ Never commit `.env` files to version control!**

## 🤝 Contributing

Please read [CONTRIBUTING.md](./docs/CONTRIBUTING.md) for coding standards and guidelines.

## 📝 License

[Add your license here]

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
