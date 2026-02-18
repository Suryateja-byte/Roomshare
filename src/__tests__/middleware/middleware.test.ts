/**
 * Tests for middleware / security headers pipeline
 *
 * Covers:
 * - applySecurityHeaders sets all required headers
 * - CSP nonce generation in production vs dev
 * - buildCspHeader directive correctness
 * - proxy.ts matcher config includes expected paths
 */

describe('applySecurityHeaders', () => {
  const originalEnv = process.env.NODE_ENV

  afterEach(() => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: originalEnv, writable: true })
  })

  function setNodeEnv(env: string) {
    Object.defineProperty(process.env, 'NODE_ENV', { value: env, writable: true })
  }

  it('sets X-Frame-Options to DENY', async () => {
    setNodeEnv('production')
    // Re-import to pick up new NODE_ENV
    jest.resetModules()
    const { applySecurityHeaders } = await import('@/lib/csp-middleware')

    const request = { headers: new Headers() }
    const { responseHeaders } = applySecurityHeaders(request)

    expect(responseHeaders.get('X-Frame-Options')).toBe('DENY')
  })

  it('sets Strict-Transport-Security with includeSubDomains and preload', async () => {
    setNodeEnv('production')
    jest.resetModules()
    const { applySecurityHeaders } = await import('@/lib/csp-middleware')

    const request = { headers: new Headers() }
    const { responseHeaders } = applySecurityHeaders(request)

    const hsts = responseHeaders.get('Strict-Transport-Security')
    expect(hsts).toContain('max-age=31536000')
    expect(hsts).toContain('includeSubDomains')
    expect(hsts).toContain('preload')
  })

  it('sets X-Content-Type-Options to nosniff', async () => {
    setNodeEnv('production')
    jest.resetModules()
    const { applySecurityHeaders } = await import('@/lib/csp-middleware')

    const request = { headers: new Headers() }
    const { responseHeaders } = applySecurityHeaders(request)

    expect(responseHeaders.get('X-Content-Type-Options')).toBe('nosniff')
  })

  it('sets X-XSS-Protection to 1; mode=block', async () => {
    setNodeEnv('production')
    jest.resetModules()
    const { applySecurityHeaders } = await import('@/lib/csp-middleware')

    const request = { headers: new Headers() }
    const { responseHeaders } = applySecurityHeaders(request)

    expect(responseHeaders.get('X-XSS-Protection')).toBe('1; mode=block')
  })

  it('sets X-DNS-Prefetch-Control to on', async () => {
    setNodeEnv('production')
    jest.resetModules()
    const { applySecurityHeaders } = await import('@/lib/csp-middleware')

    const request = { headers: new Headers() }
    const { responseHeaders } = applySecurityHeaders(request)

    expect(responseHeaders.get('X-DNS-Prefetch-Control')).toBe('on')
  })

  it('sets Referrer-Policy to origin-when-cross-origin', async () => {
    setNodeEnv('production')
    jest.resetModules()
    const { applySecurityHeaders } = await import('@/lib/csp-middleware')

    const request = { headers: new Headers() }
    const { responseHeaders } = applySecurityHeaders(request)

    expect(responseHeaders.get('Referrer-Policy')).toBe('origin-when-cross-origin')
  })

  it('sets Permissions-Policy restricting camera, microphone', async () => {
    setNodeEnv('production')
    jest.resetModules()
    const { applySecurityHeaders } = await import('@/lib/csp-middleware')

    const request = { headers: new Headers() }
    const { responseHeaders } = applySecurityHeaders(request)

    const policy = responseHeaders.get('Permissions-Policy')
    expect(policy).toContain('camera=()')
    expect(policy).toContain('microphone=()')
  })

  it('sets Content-Security-Policy on both request and response headers', async () => {
    setNodeEnv('production')
    jest.resetModules()
    const { applySecurityHeaders } = await import('@/lib/csp-middleware')

    const request = { headers: new Headers() }
    const { requestHeaders, responseHeaders } = applySecurityHeaders(request)

    expect(requestHeaders.get('content-security-policy')).toBeTruthy()
    expect(responseHeaders.get('Content-Security-Policy')).toBeTruthy()
  })

  describe('CSP nonce generation', () => {
    it('generates a nonce in production mode', async () => {
      setNodeEnv('production')
      jest.resetModules()
      const { applySecurityHeaders } = await import('@/lib/csp-middleware')

      const request = { headers: new Headers() }
      const { nonce } = applySecurityHeaders(request)

      expect(nonce).toBeDefined()
      expect(typeof nonce).toBe('string')
      expect(nonce!.length).toBe(24)
    })

    it('nonce does not contain dashes (UUID dashes stripped)', async () => {
      setNodeEnv('production')
      jest.resetModules()
      const { applySecurityHeaders } = await import('@/lib/csp-middleware')

      const request = { headers: new Headers() }
      const { nonce } = applySecurityHeaders(request)

      expect(nonce).not.toContain('-')
    })

    it('does NOT generate a nonce in development mode', async () => {
      setNodeEnv('development')
      jest.resetModules()
      const { applySecurityHeaders } = await import('@/lib/csp-middleware')

      const request = { headers: new Headers() }
      const { nonce } = applySecurityHeaders(request)

      expect(nonce).toBeUndefined()
    })

    it('includes nonce in CSP script-src when in production', async () => {
      setNodeEnv('production')
      jest.resetModules()
      const { applySecurityHeaders } = await import('@/lib/csp-middleware')

      const request = { headers: new Headers() }
      const { nonce, responseHeaders } = applySecurityHeaders(request)

      const csp = responseHeaders.get('Content-Security-Policy')!
      expect(csp).toContain(`'nonce-${nonce}'`)
      expect(csp).toContain("'strict-dynamic'")
    })

    it('uses unsafe-inline and unsafe-eval in development CSP', async () => {
      setNodeEnv('development')
      jest.resetModules()
      const { applySecurityHeaders } = await import('@/lib/csp-middleware')

      const request = { headers: new Headers() }
      const { responseHeaders } = applySecurityHeaders(request)

      const csp = responseHeaders.get('Content-Security-Policy')!
      expect(csp).toContain("'unsafe-inline'")
      expect(csp).toContain("'unsafe-eval'")
    })
  })
})

describe('buildCspHeader', () => {
  const originalEnv = process.env.NODE_ENV

  afterEach(() => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: originalEnv, writable: true })
  })

  function setNodeEnv(env: string) {
    Object.defineProperty(process.env, 'NODE_ENV', { value: env, writable: true })
  }

  it('includes default-src self', async () => {
    jest.resetModules()
    const { buildCspHeader } = await import('@/lib/csp')

    const csp = buildCspHeader()

    expect(csp).toContain("default-src 'self'")
  })

  it('includes object-src none', async () => {
    jest.resetModules()
    const { buildCspHeader } = await import('@/lib/csp')

    const csp = buildCspHeader()

    expect(csp).toContain("object-src 'none'")
  })

  it('includes frame-ancestors none', async () => {
    jest.resetModules()
    const { buildCspHeader } = await import('@/lib/csp')

    const csp = buildCspHeader()

    expect(csp).toContain("frame-ancestors 'none'")
  })

  it('includes base-uri self', async () => {
    jest.resetModules()
    const { buildCspHeader } = await import('@/lib/csp')

    const csp = buildCspHeader()

    expect(csp).toContain("base-uri 'self'")
  })

  it('includes form-action self', async () => {
    jest.resetModules()
    const { buildCspHeader } = await import('@/lib/csp')

    const csp = buildCspHeader()

    expect(csp).toContain("form-action 'self'")
  })

  it('includes Google Maps in connect-src', async () => {
    jest.resetModules()
    const { buildCspHeader } = await import('@/lib/csp')

    const csp = buildCspHeader()

    expect(csp).toContain('https://maps.googleapis.com')
  })

  it('includes upgrade-insecure-requests in production', async () => {
    setNodeEnv('production')
    jest.resetModules()
    const { buildCspHeader } = await import('@/lib/csp')

    const csp = buildCspHeader('testnonce')

    expect(csp).toContain('upgrade-insecure-requests')
  })

  it('does NOT include upgrade-insecure-requests in development', async () => {
    setNodeEnv('development')
    jest.resetModules()
    const { buildCspHeader } = await import('@/lib/csp')

    const csp = buildCspHeader()

    expect(csp).not.toContain('upgrade-insecure-requests')
  })
})

describe('middleware matcher config', () => {
  /**
   * middleware.ts imports auth which pulls in next-auth ESM modules that Jest
   * cannot transform directly. Instead of importing the module, we read the
   * source file and verify the matcher config structurally.
   */
  let middlewareSource: string

  beforeAll(async () => {
    const fs = await import('fs')
    const path = await import('path')
    middlewareSource = fs.readFileSync(
      path.join(process.cwd(), 'src/middleware.ts'),
      'utf-8'
    )
  })

  it('exports a config with matcher array', () => {
    expect(middlewareSource).toContain('export const config')
    expect(middlewareSource).toContain('matcher:')
  })

  it('matcher pattern excludes _next/static files', () => {
    expect(middlewareSource).toContain('_next/static')
  })

  it('matcher pattern excludes _next/image files', () => {
    expect(middlewareSource).toContain('_next/image')
  })

  it('matcher pattern excludes favicon.ico', () => {
    expect(middlewareSource).toContain('favicon.ico')
  })
})
