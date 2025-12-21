# Development Workflow Guide

## 🚀 Quick Start

### First Time Setup

```bash
# 1. Clone the repository
git clone <repository-url>
cd Snapcase_AppV2

# 2. Install dependencies
npm install
# OR
bun install

# 3. Set up environment variables
# Copy .env.example to .env and fill in your values
cp .env.example .env
# Edit .env with your actual API keys

# 4. Start development server
npm run dev

# 5. Open browser
# Navigate to http://localhost:8080
```

---

## 📝 Daily Development Workflow

### Starting Your Work Day

1. **Pull Latest Changes**
   ```bash
   git checkout develop
   git pull origin develop
   ```

2. **Check for Updates**
   ```bash
   npm outdated  # Check for dependency updates
   ```

3. **Start Development Server**
   ```bash
   npm run dev
   ```

### Working on a Feature

1. **Create Feature Branch**
   ```bash
   git checkout -b feature/add-phone-preview
   ```

2. **Make Changes**
   - Write code
   - Test frequently
   - Check browser console for errors

3. **Before Committing**
   ```bash
   # Run linter
   npm run lint
   
   # Fix any auto-fixable issues
   npm run lint -- --fix
   
   # Verify build works
   npm run build
   ```

4. **Commit Changes**
   ```bash
   git add .
   git commit -m "feat: Add phone preview functionality"
   ```

5. **Push to Remote**
   ```bash
   git push origin feature/add-phone-preview
   ```

6. **Create Pull Request**
   - Go to GitHub
   - Create PR from feature branch to `develop`
   - Add description and screenshots
   - Request review

---

## 🔄 Git Workflow

### Branch Naming Convention

- `feature/description` - New features
- `fix/description` - Bug fixes
- `hotfix/description` - Urgent production fixes
- `refactor/description` - Code refactoring
- `docs/description` - Documentation updates

### Commit Workflow

```bash
# Stage specific files
git add src/components/NewComponent.tsx

# Or stage all changes
git add .

# Commit with descriptive message
git commit -m "feat: Add new checkout flow"

# Push to remote
git push origin feature/your-branch-name
```

### Resolving Merge Conflicts

1. **Pull latest changes**
   ```bash
   git pull origin develop
   ```

2. **Resolve conflicts** in your editor
   - Look for `<<<<<<<`, `=======`, `>>>>>>>` markers
   - Choose correct code or merge both

3. **Stage resolved files**
   ```bash
   git add .
   ```

4. **Complete merge**
   ```bash
   git commit -m "Merge develop into feature/branch"
   ```

---

## 🧪 Testing Workflow

### Manual Testing Checklist

Before committing, test:

- [ ] **Core Functionality**
  - [ ] Can browse phone cases
  - [ ] Can design custom case
  - [ ] Can add to cart
  - [ ] Can checkout
  - [ ] Payment processing works
  - [ ] Order submission to Printful works

- [ ] **Error Handling**
  - [ ] Network errors handled gracefully
  - [ ] Invalid inputs show error messages
  - [ ] API failures don't crash app

- [ ] **UI/UX**
  - [ ] Responsive on mobile/tablet/desktop
  - [ ] Dark mode works (if applicable)
  - [ ] Loading states display correctly
  - [ ] Success/error messages appear

### Browser Testing

Test in:
- [ ] Chrome/Edge (latest)
- [ ] Firefox (latest)
- [ ] Safari (if available)
- [ ] Mobile browser (iOS Safari, Chrome Mobile)

---

## 🐛 Debugging Workflow

### Frontend Debugging

1. **Browser DevTools**
   - Open DevTools (F12)
   - Check Console for errors
   - Use Network tab for API calls
   - Use React DevTools for component inspection

2. **Console Logging**
   ```typescript
   console.log('Debug info:', data);
   console.error('Error:', error);
   ```

3. **Breakpoints**
   - Set breakpoints in VS Code
   - Use `debugger;` statement
   - Attach debugger in Chrome DevTools

### Backend Debugging (Supabase Functions)

1. **Check Supabase Logs**
   - Go to Supabase Dashboard
   - Navigate to Edge Functions > Logs
   - Filter by function name

2. **Local Testing**
   ```bash
   # Test Supabase functions locally
   supabase functions serve
   ```

3. **Add Logging**
   ```typescript
   console.log('[FUNCTION-NAME] Debug:', data);
   ```

---

## 🔍 Code Review Process

### As a Reviewer

1. **Check Code Quality**
   - [ ] Code follows style guide
   - [ ] No obvious bugs
   - [ ] Error handling present
   - [ ] TypeScript types used correctly

2. **Test the Changes**
   - [ ] Pull the branch locally
   - [ ] Run the application
   - [ ] Test the new feature
   - [ ] Check for regressions

3. **Provide Feedback**
   - Be constructive and specific
   - Suggest improvements
   - Approve or request changes

### As a Contributor

1. **Prepare Your PR**
   - [ ] Clear title and description
   - [ ] Link related issues
   - [ ] Add screenshots for UI changes
   - [ ] Ensure all checks pass

2. **Respond to Feedback**
   - Address all comments
   - Make requested changes
   - Re-request review when ready

---

## 🚢 Deployment Workflow

### Staging Deployment

1. **Merge to Develop**
   ```bash
   git checkout develop
   git pull origin develop
   git merge feature/your-feature
   git push origin develop
   ```

2. **Deploy to Staging**
   - Usually automated via CI/CD
   - Or manual deployment process

3. **Test on Staging**
   - Verify all features work
   - Check for errors
   - Test critical paths

### Production Deployment

1. **Merge to Main**
   ```bash
   git checkout main
   git pull origin main
   git merge develop
   git push origin main
   ```

2. **Deploy to Production**
   - Follow deployment process
   - Monitor for errors

3. **Post-Deployment**
   - Smoke test critical flows
   - Monitor error logs
   - Check analytics

---

## 🔧 Common Tasks

### Adding a New Dependency

```bash
# Install package
npm install package-name

# Install dev dependency
npm install -D package-name

# Update package-lock.json
npm install
```

### Updating Dependencies

```bash
# Check for updates
npm outdated

# Update specific package
npm install package-name@latest

# Update all packages (careful!)
npm update
```

### Resetting Local Environment

```bash
# Remove node_modules and lock files
rm -rf node_modules package-lock.json

# Clear npm cache
npm cache clean --force

# Reinstall
npm install
```

### Fixing TypeScript Errors

```bash
# Check for type errors
npm run type-check

# Or use VS Code
# Cmd/Ctrl + Shift + P > "TypeScript: Restart TS Server"
```

### Fixing Linting Errors

```bash
# Run linter
npm run lint

# Auto-fix issues
npm run lint -- --fix
```

---

## 📋 Pre-Commit Checklist

Before every commit, verify:

- [ ] Code compiles without errors
- [ ] Linter passes: `npm run lint`
- [ ] Build succeeds: `npm run build`
- [ ] No console errors in browser
- [ ] Feature works as expected
- [ ] No sensitive data in code
- [ ] Environment variables not committed
- [ ] Clear commit message

---

## 🆘 Getting Help

### When Stuck

1. **Check Documentation**
   - README.md
   - PROJECT_MANAGEMENT.md
   - Code comments

2. **Search Issues**
   - Check GitHub issues
   - Search for similar problems

3. **Ask for Help**
   - Create detailed issue
   - Include error messages
   - Provide steps to reproduce

### Common Issues

**"Module not found"**
- Run `npm install`
- Check import paths
- Verify package is installed

**"Environment variable undefined"**
- Check `.env` file exists
- Verify variable name (case-sensitive)
- Restart dev server

**"TypeScript errors"**
- Run `npm run type-check`
- Check type definitions
- Verify tsconfig.json

**"Build fails"**
- Clear cache: `rm -rf .vite dist`
- Check for syntax errors
- Verify all dependencies installed

---

## 📚 Additional Resources

- [Project Management Guide](./PROJECT_MANAGEMENT.md) - Complete best practices
- [Error Prevention Checklist](./ERROR_PREVENTION_CHECKLIST.md) - Pre-commit checklists
- [Contributing Guide](./CONTRIBUTING.md) - Coding standards
- [Git Best Practices](https://git-scm.com/book)
- [React Documentation](https://react.dev)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Vite Documentation](https://vitejs.dev)

---

**Remember**: When in doubt, ask! It's better to clarify than to make assumptions.
