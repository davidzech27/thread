import type { Browser, BrowserContext, Page, CDPSession } from 'playwright';
import { chromium } from 'playwright';

// ============================================================================
// TYPES
// ============================================================================

export interface BrowserSession {
  sessionId: string;
  context: BrowserContext;
  page: Page;
  cdp: CDPSession;
  currentUrl: string;
}

interface ScreencastFrameEvent {
  data: string;
  metadata: {
    width: number;
    height: number;
  };
  sessionId: number;
}

// ============================================================================
// STATE
// ============================================================================

let sharedBrowser: Browser | null = null;
let currentSession: BrowserSession | null = null;

// Frame broadcast callback (set by index.ts)
let frameBroadcastFn: ((sessionId: string, frameData: string, metadata: any) => void) | null = null;

export function setBrowserFrameHandler(handler: (sessionId: string, frameData: string, metadata: any) => void) {
  frameBroadcastFn = handler;
}

// ============================================================================
// BROWSER INITIALIZATION
// ============================================================================

export async function initBrowser(): Promise<void> {
  if (sharedBrowser) {
    return; // Already initialized
  }

  console.log('[Browser] Launching shared browser...');
  sharedBrowser = await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });
  console.log('[Browser] Shared browser ready');
}

export async function closeBrowser(): Promise<void> {
  if (currentSession) {
    await closeSession();
  }
  if (sharedBrowser) {
    await sharedBrowser.close();
    sharedBrowser = null;
  }
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

export async function getOrCreateSession(): Promise<BrowserSession> {
  if (currentSession) {
    return currentSession;
  }

  if (!sharedBrowser) {
    await initBrowser();
  }

  const sessionId = 'browser-session';
  const width = 2880;
  const height = 1800;

  console.log('[Browser] Creating new session');

  // Create new context with anti-detection configuration
  const context = await sharedBrowser!.newContext({
    viewport: { width, height },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    locale: 'en-US',
    timezoneId: 'America/New_York',
    deviceScaleFactor: 2,
    hasTouch: false,
    colorScheme: 'light',
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  const page = await context.newPage();

  // Inject anti-detection scripts
  await page.addInitScript(() => {
    // Remove webdriver flag
    Object.defineProperty(navigator, 'webdriver', {
      get: () => false,
    });

    // Add chrome object
    (window as any).chrome = {
      runtime: {},
      loadTimes: function() {},
      csi: function() {},
      app: {},
    };

    // Mock plugins
    Object.defineProperty(navigator, 'plugins', {
      get: () => [
        { name: 'Chrome PDF Plugin', length: 1 },
        { name: 'Chrome PDF Viewer', length: 1 },
        { name: 'Native Client', length: 1 },
      ],
    });

    // Fix languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
    });

    // Override permissions query
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters: any) => (
      parameters.name === 'notifications' ?
        Promise.resolve({ state: (Notification as any).permission } as PermissionStatus) :
        originalQuery(parameters)
    );
  });

  // Get CDP session
  const cdp = await context.newCDPSession(page);

  // Start screencast with primary quality
  await cdp.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 85,
    maxWidth: width,
    maxHeight: height,
    everyNthFrame: 1, // Max FPS
  });

  // Listen for frames
  cdp.on('Page.screencastFrame', async (event) => {
    const frameEvent = event as unknown as ScreencastFrameEvent;

    // Broadcast frame if handler is set
    if (frameBroadcastFn) {
      // Ensure metadata has width and height
      const metadata = {
        width: frameEvent.metadata?.width || width,
        height: frameEvent.metadata?.height || height,
      };
      frameBroadcastFn(sessionId, frameEvent.data, metadata);
    }

    // Acknowledge frame
    await cdp.send('Page.screencastFrameAck', {
      sessionId: frameEvent.sessionId,
    });
  });

  // Listen for URL changes
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) {
      const newUrl = frame.url();
      console.log('[Browser] URL changed to:', newUrl);
      if (currentSession) {
        currentSession.currentUrl = newUrl;
      }
    }
  });

  currentSession = {
    sessionId,
    context,
    page,
    cdp,
    currentUrl: 'about:blank',
  };

  console.log('[Browser] Session created');
  return currentSession;
}

export async function closeSession(): Promise<void> {
  if (!currentSession) {
    return;
  }

  console.log('[Browser] Closing session');

  try {
    await currentSession.cdp.detach();
    await currentSession.context.close();
  } catch (error) {
    console.error('[Browser] Error closing session:', error);
  }

  currentSession = null;
}

export function getCurrentSession(): BrowserSession | null {
  return currentSession;
}

// ============================================================================
// BROWSER ACTIONS
// ============================================================================

export async function navigateToUrl(url: string): Promise<string> {
  const session = await getOrCreateSession();

  // Normalize URL
  let normalizedUrl = url.trim();
  if (!normalizedUrl.match(/^[a-zA-Z][a-zA-Z\d+\-.]*:/)) {
    normalizedUrl = 'https://' + normalizedUrl;
  }

  console.log('[Browser] Navigating to:', normalizedUrl);

  try {
    await session.page.goto(normalizedUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    // Try to wait for load event
    await session.page.waitForLoadState('load', { timeout: 5000 }).catch(() => {
      console.log('[Browser] Load event timeout');
    });

    // Wait for network to be mostly idle
    await session.page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {
      console.log('[Browser] Network idle timeout');
    });

    const actualUrl = session.page.url();
    session.currentUrl = actualUrl;
    console.log('[Browser] Navigation complete:', actualUrl);

    // Force a screenshot to trigger initial frame
    // This ensures we have at least one frame even if the page is static
    try {
      const screenshot = await session.page.screenshot({
        type: 'jpeg',
        quality: 85,
      });
      const base64 = screenshot.toString('base64');

      // Broadcast the initial frame
      if (frameBroadcastFn) {
        frameBroadcastFn(session.sessionId, base64, {
          width: 2880,
          height: 1800,
        });
      }
    } catch (screenshotError) {
      console.error('[Browser] Failed to capture initial screenshot:', screenshotError);
    }

    return actualUrl;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Navigation failed';
    console.error('[Browser] Navigation error:', errorMessage);
    throw new Error(errorMessage);
  }
}

export async function extractPageText(): Promise<{
  title: string;
  url: string;
  text: string;
  links: Array<{ id: string; text: string; url: string }>;
}> {
  const session = await getOrCreateSession();

  const pageData = await session.page.evaluate(() => {
    const title = document.title;
    const url = window.location.href;
    const text = document.body.innerText;

    const links = Array.from(document.querySelectorAll('a[href]')).map((link, index) => ({
      id: `link-${index}`,
      text: link.textContent?.trim() || '',
      url: (link as HTMLAnchorElement).href,
    })).filter(link => link.text || link.url);

    return { title, url, text, links };
  });

  console.log('[Browser] Extracted text:', {
    title: pageData.title,
    url: pageData.url,
    textLength: pageData.text.length,
    linkCount: pageData.links.length,
  });

  return pageData;
}

export async function clickElement(elementId: string): Promise<string> {
  const session = await getOrCreateSession();

  // Parse element ID (format: link-###)
  const match = elementId.match(/^link-(\d+)$/);
  if (!match) {
    throw new Error('Invalid elementId format. Use link-###');
  }

  const index = parseInt(match[1], 10);

  const result = await session.page.evaluate((idx: number) => {
    const links = Array.from(document.querySelectorAll('a[href]'));
    if (idx < 0 || idx >= links.length) {
      return { success: false, error: `Link index ${idx} out of range (0-${links.length - 1})` };
    }

    const link = links[idx] as HTMLAnchorElement;
    const href = link.href;
    const text = link.textContent?.trim() || '';

    link.click();
    return { success: true, href, text };
  }, index);

  if (!result.success) {
    throw new Error(result.error);
  }

  console.log('[Browser] Clicked element:', elementId, result.text);
  return `Clicked ${elementId}: ${result.text} -> ${result.href}`;
}

export async function scrollTo(x: number, y: number): Promise<void> {
  const session = await getOrCreateSession();

  await session.page.evaluate((scroll: { x: number; y: number }) => {
    window.scrollTo({
      left: scroll.x,
      top: scroll.y,
      behavior: 'auto'
    });
  }, { x, y });

  console.log('[Browser] Scrolled to:', x, y);
}

export async function typeText(text: string): Promise<void> {
  const session = await getOrCreateSession();

  await session.cdp.send('Input.insertText', {
    text: text,
  });

  console.log('[Browser] Typed text:', text.substring(0, 50));
}

export async function getScrollPosition(): Promise<{ x: number; y: number }> {
  const session = await getOrCreateSession();

  const scrollPos = await session.page.evaluate(() => ({
    x: window.scrollX,
    y: window.scrollY
  }));

  return scrollPos;
}

// ============================================================================
// MOUSE/KEYBOARD INPUT (for future use)
// ============================================================================

export async function mouseClick(x: number, y: number): Promise<void> {
  const session = await getOrCreateSession();

  await session.cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x,
    y,
    button: 'left',
    clickCount: 1,
  });

  await session.cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x,
    y,
    button: 'left',
    clickCount: 1,
  });

  console.log('[Browser] Mouse click at:', x, y);
}
