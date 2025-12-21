# Error Prevention Checklist

This checklist helps prevent common errors that plagued the first iteration of the project.

## 🔴 Critical Checks (Do Before Every Commit)

### Environment & Configuration

- [ ] `.env` file is NOT committed (check `git status`)
- [ ] `.env.example` exists and is up-to-date
- [ ] All required environment variables are documented
- [ ] No hardcoded API keys or secrets in code
- [ ] Environment variables validated at startup

### Code Quality

- [ ] `npm run lint` passes with no errors
- [ ] `npm run build` succeeds without errors
- [ ] No TypeScript errors (`npm run type-check` if available)
- [ ] No `console.log` statements left in production code
- [ ] No commented-out code blocks
- [ ] No `TODO` or `FIXME` comments without tickets

### Version Control

- [ ] `.gitignore` includes all necessary patterns
- [ ] No large files committed (images, videos, etc.)
- [ ] No `node_modules` or `dist` folders committed
- [ ] Commit messages are clear and descriptive
- [ ] Branch name follows convention (`feature/`, `fix/`, etc.)

### Dependencies

- [ ] `package-lock.json` is committed (or `bun.lockb`)
- [ ] All dependencies are up-to-date or intentionally pinned
- [ ] No duplicate dependencies
- [ ] No unused dependencies
- [ ] Security vulnerabilities addressed (`npm audit`)

---

## 🟡 Important Checks (Do Before Every PR)

### Functionality

- [ ] Feature works as expected
- [ ] No breaking changes to existing features
- [ ] Error handling implemented for all API calls
- [ ] Loading states shown for async operations
- [ ] Success/error messages displayed to users

### Testing

- [ ] Manual testing completed
- [ ] Tested on multiple browsers (Chrome, Firefox, Safari)
- [ ] Tested on mobile devices (if applicable)
- [ ] Edge cases handled (empty states, errors, etc.)
- [ ] Integration with Supabase works
- [ ] Integration with Printful works
- [ ] Integration with Stripe works

### Code Review

- [ ] Code follows project style guide
- [ ] Components are properly typed
- [ ] No `any` types (unless absolutely necessary)
- [ ] Functions are properly documented
- [ ] Complex logic has comments explaining "why"

### Performance

- [ ] No unnecessary re-renders
- [ ] Images optimized
- [ ] No memory leaks (check for event listeners)
- [ ] Bundle size reasonable

---

## 🟢 Best Practice Checks (Do Weekly/Monthly)

### Documentation

- [ ] README.md is up-to-date
- [ ] New features documented
- [ ] API changes documented
- [ ] Breaking changes documented in CHANGELOG

### Security

- [ ] `npm audit` run and vulnerabilities fixed
- [ ] Dependencies are from trusted sources
- [ ] Input validation on all user inputs
- [ ] API endpoints have proper authentication
- [ ] CORS configured correctly

### Architecture

- [ ] Code is organized logically
- [ ] No circular dependencies
- [ ] Reusable components extracted
- [ ] Business logic separated from UI
- [ ] Constants extracted to config files

---

## 🚨 Common Errors to Avoid

### 1. Environment Variable Errors

**Problem**: Missing or incorrect environment variables
**Prevention**:
```typescript
// Create src/lib/env.ts
export const env = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabaseKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
} as const;

// Validate on app startup
if (!env.supabaseUrl || !env.supabaseKey) {
  throw new Error('Missing required environment variables');
}
```

### 2. Type Errors

**Problem**: TypeScript errors causing build failures
**Prevention**:
- Always define types for props, state, and API responses
- Use `interface` for objects, `type` for unions/intersections
- Avoid `any` - use `unknown` if type is truly unknown
- Enable strict mode gradually

### 3. Dependency Version Conflicts

**Problem**: Different versions causing "works on my machine" issues
**Prevention**:
- Always commit `package-lock.json`
- Use exact versions for critical dependencies
- Document version requirements in README
- Use `npm ci` in CI/CD instead of `npm install`

### 4. API Integration Errors

**Problem**: API calls failing silently or with unclear errors
**Prevention**:
```typescript
// Always handle errors
try {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  const data = await response.json();
  return data;
} catch (error) {
  console.error('API call failed:', error);
  // Show user-friendly error message
  throw error;
}
```

### 5. State Management Errors

**Problem**: State not updating, stale closures, infinite loops
**Prevention**:
- Use React Query for server state
- Use Context API properly (avoid unnecessary re-renders)
- Check dependency arrays in useEffect/useMemo/useCallback
- Use React DevTools to debug state

### 6. Build/Deployment Errors

**Problem**: Build works locally but fails in CI/CD
**Prevention**:
- Test build locally: `npm run build`
- Use same Node version in CI as locally
- Check for platform-specific code
- Verify all environment variables in CI/CD

### 7. Git Merge Conflicts

**Problem**: Conflicts when merging branches
**Prevention**:
- Pull latest changes frequently
- Keep branches small and focused
- Merge develop into feature branch regularly
- Resolve conflicts immediately

### 8. Missing Error Boundaries

**Problem**: App crashes on errors
**Prevention**:
```typescript
// Add error boundary component
class ErrorBoundary extends React.Component {
  // Implementation
}

// Wrap app in error boundary
<ErrorBoundary>
  <App />
</ErrorBoundary>
```

---

## 🔍 Pre-Deployment Checklist

Before deploying to production:

- [ ] All critical checks completed
- [ ] All important checks completed
- [ ] Staging environment tested
- [ ] Environment variables configured in production
- [ ] Database migrations applied
- [ ] API keys verified (Printful, Stripe, Supabase)
- [ ] Error tracking configured (Sentry, etc.)
- [ ] Analytics configured
- [ ] Performance tested
- [ ] Security audit completed
- [ ] Backup strategy in place
- [ ] Rollback plan documented

---

## 🛠️ Tools to Help

### Automated Checks

1. **Pre-commit Hooks** (Husky + lint-staged)
   - Run linter before commit
   - Run tests before commit
   - Check for secrets

2. **CI/CD Pipeline**
   - Run tests on every PR
   - Check build on every PR
   - Deploy to staging automatically

3. **Dependency Scanning**
   - `npm audit` for security
   - Dependabot for updates
   - Snyk for vulnerability scanning

### Manual Checks

1. **Code Review**
   - Always get second pair of eyes
   - Use PR templates
   - Review checklist in PR description

2. **Testing**
   - Manual testing checklist
   - Browser testing matrix
   - Device testing

---

## 📝 Quick Reference

### Before Committing
```bash
npm run lint          # Check code quality
npm run build         # Verify build works
git status            # Check what's being committed
```

### Before Pushing
```bash
git pull origin develop  # Get latest changes
npm test                # Run tests (when available)
npm run type-check      # Check TypeScript (when available)
```

### Before Merging PR
- [ ] All checks passing
- [ ] Code reviewed
- [ ] Tested manually
- [ ] Documentation updated
- [ ] No breaking changes

---

## 🎯 Success Metrics

Track these to measure improvement:

- **Build Success Rate**: Should be >95%
- **Lint Error Rate**: Should be 0%
- **TypeScript Error Rate**: Should be 0%
- **Deployment Success Rate**: Should be >98%
- **Production Error Rate**: Should be <0.1%

---

**Remember**: Prevention is better than fixing. Take time to check before committing!

