# Quick Reference Guide

## 🚀 Most Common Commands

```bash
# Development
npm run dev              # Start dev server (http://localhost:8080)
npm run build            # Build for production
npm run preview          # Preview production build

# Code Quality
npm run lint             # Check code quality
npm run lint:fix         # Auto-fix linting issues
npm run type-check       # Check TypeScript types
npm run check            # Run all checks (lint + type-check + build)

# Maintenance
npm run audit            # Check for security vulnerabilities
npm run clean            # Clean build cache
```

## 📝 Git Workflow

```bash
# Start new feature
git checkout develop
git pull origin develop
git checkout -b feature/my-feature

# Make changes, then commit
git add .
git commit -m "feat: description"

# Push and create PR
git push origin feature/my-feature
# Then create PR on GitHub
```

## 🔍 Before Committing Checklist

- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] No console errors
- [ ] Feature tested manually
- [ ] No `.env` file in commit

## 🐛 Common Issues & Fixes

### Build Fails
```bash
npm run clean
npm install
npm run build
```

### TypeScript Errors
```bash
npm run type-check
# Fix errors, then restart TS server in VS Code
```

### Linting Errors
```bash
npm run lint:fix
```

### Environment Variables Not Working
- Check `.env` file exists
- Verify variable names (case-sensitive)
- Restart dev server after changes

## 📚 Documentation Files

- `PROJECT_MANAGEMENT.md` - Complete project guide
- `DEVELOPMENT_WORKFLOW.md` - Step-by-step workflows
- `ERROR_PREVENTION_CHECKLIST.md` - Pre-commit checklist
- `CONTRIBUTING.md` - Coding standards
- `README.md` - Setup instructions

## 🆘 Need Help?

1. Check relevant documentation file
2. Search GitHub issues
3. Check browser console for errors
4. Check Supabase function logs
5. Ask team for help

---

**Pro Tip**: Bookmark this file for quick access!

