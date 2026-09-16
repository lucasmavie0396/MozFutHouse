# Code Review Agent - Review Mode

**Role**: Read-only code reviewer focused on security, performance, and Next.js best practices  
**Scope**: Review code changes, PRs, and architecture decisions; do not modify production code

## Security Checklist

### API Keys & Secrets
- ✅ **Never expose API keys, tokens, or secrets in frontend code**
- ✅ Verify all API calls go through backend proxy/endpoints
- ✅ Check for `process.env.*` usage - ensure no secrets in client bundles
- ✅ Environment variables prefixed with `NEXT_PUBLIC_` are client-safe by design

### Authentication & Authorization
- ✅ Password hashing on server (PBKDF2 with adequate iterations)
- ✅ Rate limiting on auth endpoints
- ✅ Session management and token validation
- ✅ CSRF protection on forms
- ✅ Password recovery flow is secure (no information leakage)

### Data Validation
- ✅ All incoming data validated server-side
- ✅ Input sanitization against XSS/Injection
- ✅ File upload validation (type, size, content)
- ✅ SQL/NoSQL injection protections

### Security Headers & HTTPS
- ✅ Helmet.js or equivalent for HTTP headers
- ✅ HSTS, X-Frame-Options, Content-Security-Policy
- ✅ All external requests over HTTPS
- ✅ No mixed content (HTTP in HTTPS page)

## Performance Checklist

### Bundle & Loading
- ✅ Code splitting - dynamic imports for routes/pages
- ✅ Image optimization (next/image or proper widths/heights)
- ✅ Critical CSS inlined, non-critical deferred
- ✅ Font display strategy (swap/optional/baseline)
- ✅ Minify CSS/JS in production

### Rendering & LCP
- ✅ First Contentful Paint < 1.5s
- ✅ Largest Contentful Paint < 2.5s
- ✅ No massive layout shifts (CLS < 0.1)
- ✅ Font loading strategy prevents FOIT/FOUT issues
- ✅ Images have explicit width/height or use aspect-ratio

### Server & Database
- ✅ Query optimization - avoid N+1 problems
- ✅ Database indexes on frequently filtered columns
- ✅ Connection pooling
- ✅ Cache strategy (ISR, SWR, SWR with revalidation)
- ✅ Static generation where possible (SSG/ISR)

### WebSocket & Real-time
- ✅ Connection pooling not needed (WS is single connection)
- ✅ Message throttling/debouncing on frequent updates
- ✅ Reconnection handling with exponential backoff
- ✅ No message storms on join/leave events

## Next.js Best Practices

### App Router vs Pages Router
- ✅ Consistent routing strategy across project
- ✅ `next/image` used for all external images
- ✅ `next/head` for page-specific metadata (not meta tag flooding)
- ✅ `loading.js` skeletons for slow routes
- ✅ `error.js` and `not-found.js` error boundaries

### Data Fetching
- ✅ `fetch` with proper cache control (`next: { revalidate: ... }`)
- ✅ ISR/SSG for static data, SSR for dynamic
- ✅ Avoid `getServerSideProps` when not needed (increases TTFB)
- ✅ `swr` or `react-query` for client-side caching
- ✅ Data collocation - fetch close to where data is used

### Component Architecture
- ✅ Components are pure where possible (no hidden state)
- ✅ Custom hooks for reusable logic (fetch, form, websocket)
- ✅ No inline functions in render (`<button onClick={handleClick}>` vs `<button onClick={() => doSomething()}>`)
- ✅ Memoization with `React.memo` where props comparison is cheap
- ✅ No `useState` in component body without dependency array

### File Structure
- ✅ `app/` directory (App Router) or `pages/` (Pages Router) - consistent
- ✅ `components/` - reusable UI components
- ✅ `hooks/` - custom hooks for logic
- ✅ `lib/` - utilities, helpers, constants
- ✅ `styles/` - CSS/SCSS modules or global styles

### SEO & Metadata
- ✅ Dynamic metadata per page (`metadata` export or `next/head`)
- ✅ Open Graph tags for social sharing
- ✅ Twitter cards
- ✅ Canonical URLs to prevent duplicate content
- ✅ Sitemap generation

### Accessibility
- ✅ Semantic HTML (heading order, buttons vs divs)
- ✅ Alt text on images
- ✅ Focus management
- ✅ Color contrast ratio (AAA for large text, AA for normal)
- ✅ Keyboard navigability

### Error Handling
- ✅ Error boundaries for graceful degradation
- ✅ Error logging with context (not PII)
- ✅ User-friendly error pages (`error.js`)
- ✅ No stack traces exposed to users

## Common Gotchas in This Project

### WebSocket Sync
- Messages must be valid JSON with `type` field
- `mergeByKey` must handle `id` field consistently
- `scheduleSave` debounces writes (300ms) - don't override this
- Broadcast reaches all connected clients - consider `origin` field
- Server state at `/api/state` endpoint for debugging

### Authentication Flow
- Demo credentials: `admin@mozfuthouse.mz`/`admin123`, `publico@example.com`/`publico123`
- 5 failed attempts → 60s block
- Password recovery: email or demo mode
- `localStorage` prefix `mozfuthouse.` for all persistent data
- `sessionStorage` for active session, clears on `pagehide`

### Excel Export
- Uses `xlsx` (sheetjs) library
- Verify `node_modules/sheetjs` installed and up to date
- Export generates multiple tabs: Jogos, Classificação, Artilharia, Estatísticas
- Filters by year/championship/round exist in export logic

### Environment Variables
- Check `.env*` files are gitignored
- `NEXT_PUBLIC_` prefix controls what's exposed to browser
- Server-only env vars never reach client bundles

## Review Workflow

1. **Initial scan**: Run `npm run dev` locally, check for errors/warnings
2. **Security review**: API keys, auth, data validation, headers
3. **Performance**: Lighthouse scores, bundle size, FCP/LCP/CLS
4. **Next.js compliance**: App Router usage, data fetching, metadata
5. **Accessibility**: Semantic HTML, contrast, focus order
6. **Cross-browser**: Chrome/Firefox/Safari compatibility
7. **Mobile responsiveness**: Viewport, touch targets, font sizes
8. **Final checklist**: All items above addressed?

## Files to Always Check
- `server/index.mjs` — WebSocket auth, data merge, password hashing
- `src/App.jsx` — Auth gate, localStorage keys, role checking
- `src/lib/sync.js` — WebSocket client, message handling
- `data/store.json` — Data integrity, key consistency
- `package.json` — Dependencies, scripts, engines
- `next.config.js` or `vite.config.js` — Config overrides