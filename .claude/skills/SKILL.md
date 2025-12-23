---
name: vibe-to-production
description: Transform AI-generated "vibe coded" websites into secure, performant, production-ready applications. Use when user has prototype/MVP code from AI tools (Cursor, Copilot, v0, Bolt, Lovable, Replit, ChatGPT, Claude) and needs production hardening. Covers security vulnerability remediation, performance optimization, code quality, testing, SEO, accessibility (WCAG), error handling, logging, monitoring, and deployment preparation. Triggers on phrases like "make production ready", "harden for production", "fix AI-generated code", "prepare for launch", "security audit", "optimize my site", "deploy my app", or when reviewing prototype/MVP code quality.
---

# Vibe-to-Production: AI Code Production Hardening

Transform rapidly prototyped AI-generated code into secure, maintainable, production-grade applications.

## Critical Context

AI-generated code introduces vulnerabilities at alarming rates:
- 45% of AI-generated code contains security flaws (Veracode 2025)
- 72% failure rate for Java, 86% Cross-Site Scripting vulnerability rate
- Common issues: missing input validation, SQL injection, XSS, hardcoded secrets, authentication bypasses

## Production Readiness Workflow

Execute phases in order. Each phase builds on previous fixes.

### Phase 1: Security Hardening (CRITICAL - Do First)

See `references/security-checklist.md` for detailed vulnerability patterns and fixes.

**Immediate Actions:**
1. **Scan for secrets** - Search codebase for API keys, passwords, tokens
2. **Input validation** - Add validation to ALL user inputs, API parameters
3. **Output encoding** - Escape ALL dynamic content rendered in HTML
4. **Authentication** - Verify auth on every protected route/API endpoint
5. **SQL/NoSQL injection** - Use parameterized queries, never string concatenation
6. **Dependency audit** - Run `npm audit` / `pip-audit` / equivalent

**Environment Security:**
```bash
# Never commit secrets - use .env files and verify .gitignore
echo ".env*" >> .gitignore
echo "*.pem" >> .gitignore
echo "*_secret*" >> .gitignore
```

### Phase 2: Code Quality & Architecture

See `references/code-quality-checklist.md` for detailed patterns.

**Structure Improvements:**
1. **Remove dead code** - Delete unused components, functions, imports
2. **Extract constants** - No magic numbers/strings in code
3. **Component decomposition** - Split large components (>300 lines)
4. **Error boundaries** - Wrap sections that can fail independently
5. **Type safety** - Add TypeScript types, Zod validation schemas
6. **Consistent patterns** - Standardize naming, file structure, imports

**AI Code Anti-Patterns to Fix:**
- 2.4x more abstraction layers than necessary - flatten architecture
- Hallucinated dependencies - verify every package exists in registry
- Overly complex solutions - simplify when possible
- Missing edge case handling - add defensive code

### Phase 3: Performance Optimization

See `references/performance-checklist.md` for Core Web Vitals optimization.

**Critical Metrics (2025 Targets):**
- LCP (Largest Contentful Paint): < 2.5s
- INP (Interaction to Next Paint): < 200ms
- CLS (Cumulative Layout Shift): < 0.1

**Quick Wins:**
1. **Images** - Use WebP/AVIF, lazy loading, explicit dimensions
2. **Code splitting** - Dynamic imports for non-critical components
3. **Bundle analysis** - Identify and remove bloated dependencies
4. **Caching** - Implement proper cache headers, service workers
5. **Fonts** - Use `font-display: swap`, subset fonts
6. **Third-party scripts** - Defer/async, consider Partytown for web workers

**React/Next.js Specific:**
```javascript
// Dynamic import for heavy components
const HeavyChart = dynamic(() => import('./Chart'), {
  loading: () => <Skeleton />,
  ssr: false
});

// Image optimization
<Image src={img} width={800} height={600} priority={aboveFold} />
```

### Phase 4: Testing Implementation

See `references/testing-strategy.md` for comprehensive testing patterns.

**Testing Pyramid (Target Distribution):**
- 70% Unit tests - Individual functions, utilities
- 20% Integration tests - Component interactions, API routes
- 10% E2E tests - Critical user journeys only

**Minimum Viable Test Suite:**
1. Auth flows (login, logout, password reset)
2. Payment/checkout if applicable
3. Core business logic functions
4. API endpoint validation
5. Form submissions

**Tools Recommendation:**
- Unit/Integration: Vitest or Jest + Testing Library
- E2E: Playwright (best cross-browser) or Cypress
- API: Supertest or native fetch testing

### Phase 5: SEO & Accessibility

See `references/seo-accessibility-checklist.md` for comprehensive requirements.

**SEO Essentials:**
1. Meta tags (title, description, Open Graph)
2. Semantic HTML (h1-h6 hierarchy, landmarks)
3. Structured data (JSON-LD schema markup)
4. Sitemap.xml and robots.txt
5. Canonical URLs for duplicate content
6. Mobile-first responsive design

**Accessibility (WCAG 2.2):**
1. Color contrast ratio ≥ 4.5:1 for text
2. Keyboard navigation (all interactive elements)
3. ARIA labels for non-text content
4. Focus indicators visible
5. Alt text for images
6. Screen reader testing

### Phase 6: Error Handling & Monitoring

See `references/error-monitoring-checklist.md` for production setup.

**Error Handling Patterns:**
```javascript
// Global error boundary
class ErrorBoundary extends React.Component {
  state = { hasError: false };
  static getDerivedStateFromError(error) {
    return { hasError: true };
  }
  componentDidCatch(error, info) {
    logErrorToService(error, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return <FallbackUI onRetry={() => this.setState({ hasError: false })} />;
    }
    return this.props.children;
  }
}

// API error handling
async function fetchData(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (error) {
    logger.error('Fetch failed', { url, error: error.message });
    throw new UserFacingError('Unable to load data. Please try again.');
  }
}
```

**Logging Requirements:**
- Structured JSON format
- Log levels: DEBUG, INFO, WARN, ERROR, FATAL
- Never log PII, passwords, tokens
- Include request IDs for tracing
- Centralized aggregation (Sentry, LogRocket, Datadog)

### Phase 7: Deployment Preparation

**Pre-Launch Checklist:**
1. Environment variables properly configured
2. Database migrations tested
3. SSL/HTTPS enforced
4. Security headers set (CSP, HSTS, X-Frame-Options)
5. Rate limiting on APIs
6. Backup strategy documented
7. Rollback procedure tested
8. Monitoring/alerting configured

**Security Headers (nginx/vercel.json example):**
```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-XSS-Protection", "value": "1; mode=block" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" }
      ]
    }
  ]
}
```

## Quick Audit Script

Run this to identify common issues:

```bash
# Security scan
npm audit --audit-level=high
grep -rn "password\|secret\|api_key\|token" --include="*.{js,ts,jsx,tsx,json}" . | grep -v node_modules | grep -v ".env"

# Unused dependencies
npx depcheck

# Bundle size analysis
npx @next/bundle-analyzer # or webpack-bundle-analyzer

# Lighthouse audit
npx lighthouse http://localhost:3000 --output=json --output-path=./lighthouse.json
```

## Output Deliverables

After production hardening, provide:
1. Security fixes implemented (with before/after)
2. Performance metrics comparison
3. Test coverage summary
4. Remaining technical debt items
5. Monitoring dashboard setup
6. Deployment instructions
