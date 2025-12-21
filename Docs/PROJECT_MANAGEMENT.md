# Snapcase App V2 - Project Management Guide

## 🎯 Overview

This document outlines best practices, workflows, and tools to keep the Snapcase project running smoothly, efficiently, and error-free.

## 📋 Table of Contents

1. [Environment Setup](#environment-setup)
2. [Version Control Best Practices](#version-control-best-practices)
3. [Code Quality Standards](#code-quality-standards)
4. [Error Prevention Strategies](#error-prevention-strategies)
5. [Development Workflow](#development-workflow)
6. [Testing Strategy](#testing-strategy)
7. [Deployment Checklist](#deployment-checklist)
8. [Tools & Extensions](#tools--extensions)

---

## 🔧 Environment Setup

### Required Environment Variables

Create a `.env` file in the root directory (use `.env.example` as a template):

```bash
# Frontend (Vite)
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=

# Backend (Supabase Functions)
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
PRINTFUL_API_KEY=
STRIPE_SECRET_KEY=
```

**⚠️ CRITICAL**: Never commit `.env` files to version control!

### Initial Setup Checklist

- [ ] Clone repository
- [ ] Copy `.env.example` to `.env` and fill in values
- [ ] Run `npm install` (or `bun install`)
- [ ] Verify all environment variables are set
- [ ] Run `npm run dev` to start development server
- [ ] Verify Supabase connection
- [ ] Verify Printful API connection
- [ ] Verify Stripe integration

---

## 🔄 Version Control Best Practices

### Branch Strategy

```
main (production-ready code)
  └── develop (integration branch)
      └── feature/feature-name (new features)
      └── fix/bug-name (bug fixes)
      └── hotfix/critical-fix (urgent production fixes)
```

### Commit Message Convention

Use clear, descriptive commit messages:

```
feat: Add phone case preview functionality
fix: Resolve Printful API timeout issue
docs: Update README with setup instructions
refactor: Simplify cart context logic
test: Add unit tests for checkout flow
chore: Update dependencies
```

**Format**: `type: description`

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting)
- `refactor`: Code refactoring
- `test`: Adding tests
- `chore`: Maintenance tasks

### Pre-Commit Checklist

Before committing, always:

1. ✅ Run `npm run lint` - fix all linting errors
2. ✅ Run `npm run build` - ensure project builds successfully
3. ✅ Test the feature/bug fix manually
4. ✅ Check for console errors in browser
5. ✅ Verify environment variables are not committed
6. ✅ Review changed files with `git diff`
7. ✅ Write clear commit message

### Pull Request Guidelines

When creating a PR:

- [ ] Clear title describing the change
- [ ] Description explaining what and why
- [ ] Link to related issues/tickets
- [ ] Screenshots for UI changes
- [ ] All checks passing (lint, build, tests)
- [ ] Code reviewed by team member
- [ ] No merge conflicts

---

## 📐 Code Quality Standards

### TypeScript Configuration

Current settings are relaxed for rapid development. As the project matures, consider:

- Enabling `strict: true` gradually
- Enabling `noImplicitAny: true`
- Enabling `strictNullChecks: true`

### Code Style

- Use ESLint (already configured)
- Follow React best practices
- Use functional components with hooks
- Keep components small and focused
- Extract reusable logic into custom hooks
- Use TypeScript types/interfaces for all props

### File Organization

```
src/
  ├── components/     # Reusable UI components
  │   ├── ui/        # shadcn/ui components
  │   └── editor/    # Editor-specific components
  ├── pages/         # Page components
  ├── hooks/         # Custom React hooks
  ├── contexts/      # React contexts
  ├── lib/           # Utility functions
  ├── data/          # Static data
  └── integrations/  # Third-party integrations
```

---

## 🛡️ Error Prevention Strategies

### 1. Environment Variable Validation

Always validate environment variables at startup:

```typescript
// Add to src/lib/env.ts
export const validateEnv = () => {
  const required = [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_PUBLISHABLE_KEY'
  ];
  
  const missing = required.filter(key => !import.meta.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }
};
```

### 2. API Error Handling

- Always use try-catch blocks for async operations
- Provide user-friendly error messages
- Log errors for debugging
- Implement retry logic for transient failures

### 3. Type Safety

- Use TypeScript types for all API responses
- Validate data with Zod schemas (already in use)
- Never use `any` type (except where absolutely necessary)

### 4. Dependency Management

- Regularly update dependencies: `npm outdated`
- Test updates in a separate branch
- Lock dependency versions in `package-lock.json`
- Document breaking changes in CHANGELOG

---

## 🔄 Development Workflow

### Daily Workflow

1. **Start of Day**
   - Pull latest changes: `git pull origin develop`
   - Check for dependency updates
   - Review any new issues/PRs

2. **During Development**
   - Create feature branch: `git checkout -b feature/my-feature`
   - Make incremental commits
   - Test frequently
   - Run linter before committing

3. **End of Day**
   - Commit and push work
   - Create PR if feature is complete
   - Document any blockers

### Feature Development Process

1. **Planning**
   - Create issue/ticket describing the feature
   - Break down into small tasks
   - Identify dependencies

2. **Implementation**
   - Create feature branch
   - Write code following standards
   - Test thoroughly
   - Update documentation

3. **Review**
   - Self-review code
   - Create PR with description
   - Address review feedback
   - Merge after approval

---

## 🧪 Testing Strategy

### Current Status

Testing infrastructure is not yet set up. Recommended additions:

### Recommended Testing Tools

1. **Unit Tests**: Vitest (Vite-native, fast)
2. **Component Tests**: React Testing Library
3. **E2E Tests**: Playwright or Cypress
4. **API Tests**: Supertest for Supabase functions

### Testing Priorities

1. **Critical Paths** (test first):
   - Checkout flow
   - Payment processing
   - Order submission to Printful
   - Cart functionality

2. **Business Logic**:
   - Price calculations
   - Shipping cost logic
   - Order validation

3. **UI Components**:
   - Form validation
   - User interactions
   - Error states

---

## 🚀 Deployment Checklist

### Pre-Deployment

- [ ] All tests passing
- [ ] Linting passes: `npm run lint`
- [ ] Build succeeds: `npm run build`
- [ ] Environment variables configured in production
- [ ] Database migrations applied
- [ ] API keys verified
- [ ] Error tracking configured (e.g., Sentry)
- [ ] Analytics configured

### Post-Deployment

- [ ] Smoke test critical user flows
- [ ] Monitor error logs
- [ ] Check performance metrics
- [ ] Verify integrations (Stripe, Printful)
- [ ] Test on multiple devices/browsers

---

## 🛠️ Tools & Extensions

### Recommended VS Code Extensions

1. **ESLint** - Code linting
2. **Prettier** - Code formatting
3. **TypeScript** - Type checking
4. **GitLens** - Git integration
5. **Error Lens** - Inline error display
6. **Thunder Client** - API testing
7. **Supabase** - Supabase integration

### Recommended Browser Extensions

1. **React Developer Tools**
2. **Redux DevTools** (if using Redux)
3. **Lighthouse** - Performance auditing

### Useful Commands

```bash
# Development
npm run dev              # Start dev server
npm run build            # Build for production
npm run preview          # Preview production build
npm run lint             # Run ESLint

# Code Quality
npm run type-check       # TypeScript type checking (add to package.json)
npm run format           # Format code (if Prettier is added)
```

---

## 📊 Monitoring & Analytics

### Recommended Tools

1. **Error Tracking**: Sentry
2. **Analytics**: Google Analytics or Plausible
3. **Performance**: Vercel Analytics or Cloudflare Analytics
4. **Uptime Monitoring**: UptimeRobot or Pingdom

### Key Metrics to Track

- Error rates
- Page load times
- API response times
- Conversion rates
- User engagement

---

## 🔐 Security Best Practices

1. **Never commit secrets** - Use environment variables
2. **Use HTTPS** - Always in production
3. **Validate inputs** - Server-side validation
4. **Rate limiting** - Prevent abuse
5. **CORS configuration** - Restrict origins
6. **Dependency scanning** - Regular security audits

---

## 📝 Documentation Standards

### Code Comments

- Document complex logic
- Explain "why" not "what"
- Keep comments up-to-date
- Use JSDoc for functions

### README Updates

- Keep setup instructions current
- Document new features
- Include troubleshooting section
- Add architecture diagrams for complex flows

---

## 🆘 Troubleshooting

### Common Issues

1. **Build Failures**
   - Clear cache: `rm -rf node_modules .vite dist`
   - Reinstall: `npm install`
   - Check Node version compatibility

2. **Environment Variable Issues**
   - Verify `.env` file exists
   - Check variable names (case-sensitive)
   - Restart dev server after changes

3. **TypeScript Errors**
   - Run `npm run type-check`
   - Check `tsconfig.json` settings
   - Verify type definitions installed

4. **Supabase Connection Issues**
   - Verify API keys
   - Check network connectivity
   - Review Supabase dashboard for errors

---

## 📅 Regular Maintenance

### Weekly

- Review and merge open PRs
- Update dependencies
- Review error logs
- Check performance metrics

### Monthly

- Security audit
- Dependency updates
- Documentation review
- Architecture review

### Quarterly

- Major dependency updates
- Performance optimization
- Feature deprecation review
- Team retrospective

---

## 🎓 Learning Resources

- [React Documentation](https://react.dev)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Supabase Docs](https://supabase.com/docs)
- [Printful API Docs](https://developers.printful.com/)
- [Stripe Docs](https://stripe.com/docs)

---

## 📞 Support & Contacts

- **Project Repository**: [GitHub URL]
- **Documentation**: [Docs URL]
- **Issue Tracker**: [Issues URL]

---

**Last Updated**: [Date]
**Maintained By**: [Team/Name]
