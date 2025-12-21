# Contributing to Snapcase App V2

Thank you for contributing! This guide will help you understand our coding standards and contribution process.

## 📋 Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Getting Started](#getting-started)
3. [Coding Standards](#coding-standards)
4. [Commit Guidelines](#commit-guidelines)
5. [Pull Request Process](#pull-request-process)
6. [Code Review Guidelines](#code-review-guidelines)

---

## 🤝 Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Focus on what's best for the project
- Help others learn and grow

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ (or Bun)
- Git
- Code editor (VS Code recommended)

### Setup

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/your-username/Snapcase_AppV2.git
   cd Snapcase_AppV2
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Set up environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

5. Create a branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

---

## 📐 Coding Standards

### TypeScript

- **Use TypeScript** for all new code
- **Define types** for all props, state, and API responses
- **Avoid `any`** - use `unknown` if type is truly unknown
- **Use interfaces** for object shapes
- **Use type aliases** for unions/intersections

```typescript
// ✅ Good
interface User {
  id: string;
  email: string;
  name: string;
}

// ❌ Bad
const user: any = { id: '1', email: 'test@example.com' };
```

### React Components

- **Use functional components** with hooks
- **Keep components small** and focused (single responsibility)
- **Extract reusable logic** into custom hooks
- **Use meaningful names** for components and variables

```typescript
// ✅ Good
export function PhoneCasePreview({ caseId }: { caseId: string }) {
  const { data, isLoading } = usePhoneCase(caseId);
  
  if (isLoading) return <LoadingSpinner />;
  if (!data) return <ErrorMessage />;
  
  return <CaseImage src={data.imageUrl} />;
}

// ❌ Bad
export function Component1({ id }: any) {
  // 200 lines of mixed logic
}
```

### File Organization

- **One component per file**
- **Co-locate related files** (component + styles + tests)
- **Use index files** for clean imports
- **Group by feature**, not by type

```
✅ Good structure:
src/
  features/
    checkout/
      CheckoutPage.tsx
      CheckoutForm.tsx
      useCheckout.ts
      checkout.test.tsx

❌ Bad structure:
src/
  components/
    CheckoutPage.tsx
    CheckoutForm.tsx
  hooks/
    useCheckout.ts
  tests/
    checkout.test.tsx
```

### Naming Conventions

- **Components**: PascalCase (`PhoneCasePreview.tsx`)
- **Hooks**: camelCase starting with `use` (`usePhoneCase.ts`)
- **Utilities**: camelCase (`formatPrice.ts`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_QUANTITY`)
- **Types/Interfaces**: PascalCase (`User`, `OrderItem`)

### Code Style

- **Use meaningful variable names**
- **Keep functions small** (ideally < 50 lines)
- **Extract magic numbers** to constants
- **Add comments** for complex logic (explain "why", not "what")

```typescript
// ✅ Good
const SHIPPING_COST = 4.99;
const FREE_SHIPPING_THRESHOLD = 50;

const total = subtotal + (subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_COST);

// ❌ Bad
const total = subtotal + (subtotal >= 50 ? 0 : 4.99);
```

### Error Handling

- **Always handle errors** in async operations
- **Provide user-friendly messages**
- **Log errors** for debugging
- **Use error boundaries** for React components

```typescript
// ✅ Good
try {
  const order = await createOrder(data);
  toast.success('Order created successfully!');
} catch (error) {
  console.error('Failed to create order:', error);
  toast.error('Failed to create order. Please try again.');
}

// ❌ Bad
const order = await createOrder(data); // No error handling
```

### API Integration

- **Validate inputs** with Zod schemas
- **Handle loading states**
- **Handle error states**
- **Use React Query** for server state

```typescript
// ✅ Good
const { data, isLoading, error } = useQuery({
  queryKey: ['orders', orderId],
  queryFn: () => fetchOrder(orderId),
});

if (isLoading) return <LoadingSpinner />;
if (error) return <ErrorMessage error={error} />;
if (!data) return <EmptyState />;

// ❌ Bad
const [data, setData] = useState(null);
useEffect(() => {
  fetchOrder(orderId).then(setData); // No loading/error handling
}, [orderId]);
```

---

## 📝 Commit Guidelines

### Commit Message Format

```
type: subject

body (optional)

footer (optional)
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style (formatting, no logic change)
- `refactor`: Code refactoring
- `test`: Adding tests
- `chore`: Maintenance tasks
- `perf`: Performance improvements

### Examples

```
feat: Add phone case preview functionality

- Add preview component
- Integrate with Printful API
- Add loading and error states

Closes #123
```

```
fix: Resolve cart total calculation error

The cart was not including shipping costs in the total.
Now correctly calculates: subtotal + shipping = total.

Fixes #456
```

### Commit Best Practices

- **One logical change per commit**
- **Write clear, descriptive messages**
- **Reference issues** in commit message
- **Keep commits small** and focused

---

## 🔄 Pull Request Process

### Before Creating a PR

1. **Update your branch**
   ```bash
   git checkout develop
   git pull origin develop
   git checkout your-branch
   git merge develop
   ```

2. **Run checks**
   ```bash
   npm run lint
   npm run build
   ```

3. **Test thoroughly**
   - Test the feature manually
   - Check for console errors
   - Test on different browsers

### Creating a PR

1. **Push your branch**
   ```bash
   git push origin your-branch
   ```

2. **Create PR on GitHub**
   - Use clear, descriptive title
   - Fill out PR template
   - Add screenshots for UI changes
   - Link related issues

3. **PR Description Template**
   ```markdown
   ## Description
   Brief description of changes

   ## Type of Change
   - [ ] Bug fix
   - [ ] New feature
   - [ ] Breaking change
   - [ ] Documentation update

   ## Testing
   - [ ] Manual testing completed
   - [ ] Tested on Chrome
   - [ ] Tested on Firefox
   - [ ] Tested on mobile

   ## Checklist
   - [ ] Code follows style guidelines
   - [ ] Self-review completed
   - [ ] Comments added for complex code
   - [ ] Documentation updated
   - [ ] No new warnings
   - [ ] Tests added/updated
   ```

### PR Review Process

1. **Automated Checks**
   - Linter must pass
   - Build must succeed
   - Tests must pass (when available)

2. **Code Review**
   - At least one approval required
   - Address all review comments
   - Re-request review after changes

3. **Merge**
   - Squash and merge (preferred)
   - Delete branch after merge

---

## 👀 Code Review Guidelines

### As a Reviewer

**Be Constructive**
- Focus on code, not the person
- Explain why changes are needed
- Suggest improvements, don't just criticize

**Check For**
- [ ] Code follows style guide
- [ ] No obvious bugs
- [ ] Error handling present
- [ ] TypeScript types used correctly
- [ ] Performance considerations
- [ ] Security concerns
- [ ] Documentation updated

**Review Checklist**
```markdown
- [ ] Code is readable and maintainable
- [ ] No hardcoded values
- [ ] Error handling implemented
- [ ] Loading states handled
- [ ] TypeScript types are correct
- [ ] No console.logs left in code
- [ ] Tests added (if applicable)
- [ ] Documentation updated
```

### As a Contributor

**Responding to Reviews**
- Thank reviewers for feedback
- Address all comments
- Ask questions if unclear
- Re-request review when ready

**Common Feedback**
- "Add error handling" → Wrap in try-catch
- "Extract to function" → Create reusable function
- "Add type" → Define TypeScript type
- "Add comment" → Explain complex logic

---

## 🧪 Testing Guidelines

### Manual Testing

Before submitting a PR, test:

- [ ] Feature works as expected
- [ ] No console errors
- [ ] Works on Chrome
- [ ] Works on Firefox
- [ ] Works on mobile (if applicable)
- [ ] Error states handled
- [ ] Loading states shown

### Writing Tests (Future)

When test infrastructure is added:

- Write tests for critical paths
- Test edge cases
- Test error scenarios
- Aim for >80% coverage on business logic

---

## 📚 Resources

- [React Best Practices](https://react.dev/learn)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Git Commit Messages](https://chris.beams.io/posts/git-commit/)
- [Code Review Best Practices](https://google.github.io/eng-practices/review/)

---

## ❓ Questions?

- Open an issue for questions
- Check existing documentation
- Ask in team chat (if available)

---

**Thank you for contributing!** 🎉

