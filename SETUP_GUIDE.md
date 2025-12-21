# Setup Guide - Getting Started

This guide will help you set up the project for the first time or after cloning.

## 📋 Prerequisites

- **Node.js** 18+ (or Bun)
- **Git**
- **Code Editor** (VS Code recommended)
- **API Keys** for:
  - Supabase
  - Printful
  - Stripe

## 🚀 Initial Setup

### Step 1: Clone Repository

```bash
git clone <repository-url>
cd Snapcase_AppV2
```

### Step 2: Install Dependencies

```bash
npm install
# OR if using Bun
bun install
```

### Step 3: Environment Variables

1. **Create `.env` file** in the root directory:
   ```bash
   # On Windows (PowerShell)
   New-Item .env
   
   # On Mac/Linux
   touch .env
   ```

2. **Add your environment variables**:
   ```env
   # Supabase (Frontend)
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key
   
   # Supabase (Backend Functions)
   SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   
   # Printful
   PRINTFUL_API_KEY=your_printful_api_key
   
   # Stripe
   STRIPE_SECRET_KEY=your_stripe_secret_key
   ```

3. **Get API Keys**:
   - **Supabase**: https://app.supabase.com/project/_/settings/api
   - **Printful**: https://www.printful.com/dashboard/api
   - **Stripe**: https://dashboard.stripe.com/apikeys

### Step 4: Verify Setup

```bash
# Check if everything works
npm run dev
```

Open http://localhost:8080 in your browser.

### Step 5: Set Up Pre-commit Hooks (Optional but Recommended)

```bash
# Install Husky (if not already installed)
npm install --save-dev husky

# Initialize Husky
npx husky init

# The pre-commit hook should already be in .husky/pre-commit
# Make it executable (Mac/Linux)
chmod +x .husky/pre-commit
```

## ✅ Verification Checklist

After setup, verify:

- [ ] `npm run dev` starts without errors
- [ ] Browser opens to http://localhost:8080
- [ ] No console errors in browser
- [ ] Supabase connection works
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds

## 🔧 VS Code Setup (Recommended)

### Install Extensions

1. **ESLint** - Code linting
2. **Prettier** - Code formatting (optional)
3. **TypeScript** - Type checking
4. **GitLens** - Git integration
5. **Error Lens** - Inline error display

### VS Code Settings

Create `.vscode/settings.json`:

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  },
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true
}
```

## 🐛 Troubleshooting

### Issue: "Module not found"

**Solution**:
```bash
rm -rf node_modules package-lock.json
npm install
```

### Issue: "Environment variable undefined"

**Solution**:
- Check `.env` file exists in root directory
- Verify variable names match exactly (case-sensitive)
- Restart dev server after changing `.env`

### Issue: "Port 8080 already in use"

**Solution**:
```bash
# Change port in vite.config.ts
# Or kill process using port 8080
```

### Issue: "TypeScript errors"

**Solution**:
```bash
npm run type-check
# Fix errors, then restart TS server in VS Code
# Cmd/Ctrl + Shift + P > "TypeScript: Restart TS Server"
```

### Issue: "Build fails"

**Solution**:
```bash
npm run clean
npm install
npm run build
```

## 📚 Next Steps

1. Read `QUICK_REFERENCE.md` for common commands
2. Read `DEVELOPMENT_WORKFLOW.md` for daily workflow
3. Read `PROJECT_MANAGEMENT.md` for best practices
4. Read `CONTRIBUTING.md` for coding standards

## 🆘 Still Having Issues?

1. Check the troubleshooting section above
2. Review error messages carefully
3. Check browser console for frontend errors
4. Check Supabase logs for backend errors
5. Search GitHub issues
6. Ask for help in team chat

---

**Welcome to the project!** 🎉

